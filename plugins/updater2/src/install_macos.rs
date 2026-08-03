//! macOS update installation, owned here rather than delegated upstream.
//!
//! `tauri-plugin-updater` 2.10.1 stages the swap through `std::env::temp_dir()`
//! and then `std::fs::rename`s the live bundle into it. `rename(2)` cannot cross
//! filesystems, so any app not on the boot data volume — launched from a mounted
//! DMG, an external drive, or a Gatekeeper-translocated path — fails with
//! `EXDEV`, surfaced to the user as the bare "Cross-device link (os error 18)".
//! Upstream special-cases only `PermissionDenied`, so its privileged `mv`
//! fallback (which would have coped, since `mv` copies across devices) is
//! skipped and the raw errno escapes. The defect is present in every 2.x
//! release, so there is no version to bump to.
//!
//! Staging next to the bundle makes the renames same-volume by construction —
//! the approach upstream already takes for Linux AppImages. Where the bundle
//! genuinely cannot be written, the answer is a sentence the user can act on,
//! not an errno: no staging strategy can update an app on read-only media.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const STAGING_PREFIX: &str = ".meeki-update";
const NEW_BUNDLE: &str = "new_app";
const BACKUP_BUNDLE: &str = "current_app";

pub(crate) fn install_bundle(bytes: &[u8]) -> Result<(), crate::Error> {
    let bundle = crate::startup_migration::current_app_bundle_path()?;
    install_bundle_at(&bundle, bytes)
}

fn install_bundle_at(bundle: &Path, bytes: &[u8]) -> Result<(), crate::Error> {
    let parent = bundle
        .parent()
        .ok_or(crate::Error::FailedToDetermineCurrentAppPath)?;

    // Checked first, and by path: Gatekeeper's translocated mount can look
    // writable, but anything written there disappears when the app quits.
    if is_translocated(bundle) {
        return Err(crate::Error::AppNotInWritableLocation {
            path: bundle.display().to_string(),
        });
    }

    let staging = match tempfile::Builder::new()
        .prefix(STAGING_PREFIX)
        .tempdir_in(parent)
    {
        Ok(staging) => staging,
        // A read-only volume and a bundle we simply lack rights to are
        // different problems with different remedies, and telling someone to
        // move an app that is already in /Applications is worse than useless.
        Err(error) if error.kind() == io::ErrorKind::ReadOnlyFilesystem => {
            return Err(crate::Error::AppNotInWritableLocation {
                path: bundle.display().to_string(),
            });
        }
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            return Err(crate::Error::AppNotWritable {
                path: bundle.display().to_string(),
            });
        }
        Err(error) => return Err(error.into()),
    };

    let new_bundle = staging.path().join(NEW_BUNDLE);
    // A subdirectory rather than the tempdir root, which is mode 0700 — moving
    // that into place is how upstream ends up installing unreadable bundles.
    fs::create_dir(&new_bundle)?;
    unpack(bytes, &new_bundle)?;

    let backup = staging.path().join(BACKUP_BUNDLE);
    fs::rename(bundle, &backup)?;

    if let Err(error) = fs::rename(&new_bundle, bundle) {
        // Upstream leaves the user with no app at all here. Put theirs back.
        let _ = fs::rename(&backup, bundle);
        return Err(error.into());
    }

    // Nudge Launch Services to re-read the bundle it has already cached.
    let _ = filetime_now(bundle);

    Ok(())
}

fn unpack(bytes: &[u8], destination: &Path) -> Result<(), crate::Error> {
    let decoder = flate2::read::GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);

    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;
        // Archives are rooted at `<Name>.app/…`; strip that so the contents
        // land directly in the destination we are about to move into place.
        let stripped: PathBuf = path.iter().skip(1).collect();
        if stripped.as_os_str().is_empty() {
            continue;
        }
        let target = destination.join(stripped);
        // tar does not create intermediate directories, and an archive need not
        // list them before the files inside them.
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        entry.unpack(&target)?;
    }

    Ok(())
}

fn filetime_now(path: &Path) -> io::Result<()> {
    let now = std::time::SystemTime::now();
    fs::File::open(path)?.set_times(fs::FileTimes::new().set_modified(now))
}

/// Gatekeeper runs a quarantined app from a read-only mount under
/// `/private/var/folders/…/AppTranslocation/<uuid>/d/`, which no in-place update
/// can survive — the mount disappears when the app quits.
fn is_translocated(bundle: &Path) -> bool {
    bundle
        .components()
        .any(|component| component.as_os_str() == "AppTranslocation")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    fn tarball(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut builder = tar::Builder::new(Vec::new());
        for (name, contents) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(contents.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, name, &contents[..])
                .unwrap();
        }
        let tar = builder.into_inner().unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&tar).unwrap();
        encoder.finish().unwrap()
    }

    fn existing_bundle(root: &Path) -> PathBuf {
        let bundle = root.join("Meeki.app");
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        fs::write(bundle.join("Contents/MacOS/meeki"), b"old").unwrap();
        bundle
    }

    #[test]
    fn replaces_the_bundle_in_place() {
        let root = tempfile::TempDir::new().unwrap();
        let bundle = existing_bundle(root.path());

        install_bundle_at(
            &bundle,
            &tarball(&[("Meeki.app/Contents/MacOS/meeki", b"new")]),
        )
        .unwrap();

        assert_eq!(
            fs::read(bundle.join("Contents/MacOS/meeki")).unwrap(),
            b"new"
        );
    }

    #[test]
    fn stages_on_the_same_device_as_the_bundle() {
        // The whole point: a rename across devices is what upstream gets wrong.
        let root = tempfile::TempDir::new().unwrap();
        let bundle = existing_bundle(root.path());
        let before = bundle.metadata().unwrap().dev();

        install_bundle_at(
            &bundle,
            &tarball(&[("Meeki.app/Contents/MacOS/meeki", b"new")]),
        )
        .unwrap();

        assert_eq!(bundle.metadata().unwrap().dev(), before);
    }

    #[test]
    fn installs_a_readable_bundle_not_a_0700_tempdir() {
        let root = tempfile::TempDir::new().unwrap();
        let bundle = existing_bundle(root.path());

        install_bundle_at(
            &bundle,
            &tarball(&[("Meeki.app/Contents/MacOS/meeki", b"new")]),
        )
        .unwrap();

        let mode = bundle.metadata().unwrap().permissions().mode() & 0o777;
        assert_ne!(mode, 0o700, "a 0700 bundle is unreadable to other users");
    }

    #[test]
    fn keeps_the_old_bundle_when_the_archive_is_unusable() {
        let root = tempfile::TempDir::new().unwrap();
        let bundle = existing_bundle(root.path());

        let error = install_bundle_at(&bundle, b"not a gzip stream at all");

        assert!(error.is_err());
        assert_eq!(
            fs::read(bundle.join("Contents/MacOS/meeki")).unwrap(),
            b"old",
            "a failed install must not leave the user without an app"
        );
    }

    #[test]
    fn asks_the_user_to_move_a_translocated_app() {
        let root = tempfile::TempDir::new().unwrap();
        let translocated = root.path().join("AppTranslocation/abc/d");
        fs::create_dir_all(&translocated).unwrap();
        let bundle = existing_bundle(&translocated);

        let error = install_bundle_at(
            &bundle,
            &tarball(&[("Meeki.app/Contents/MacOS/meeki", b"new")]),
        )
        .unwrap_err();

        assert!(
            matches!(error, crate::Error::AppNotInWritableLocation { .. }),
            "expected an actionable message, got {error:?}"
        );
        assert!(
            error.to_string().contains("Applications"),
            "the message should say what to do: {error}"
        );
    }

    #[test]
    fn reports_a_permission_problem_rather_than_an_errno() {
        let root = tempfile::TempDir::new().unwrap();
        let bundle = existing_bundle(root.path());
        let mut perms = root.path().metadata().unwrap().permissions();
        perms.set_mode(0o500);
        fs::set_permissions(root.path(), perms).unwrap();

        let error = install_bundle_at(
            &bundle,
            &tarball(&[("Meeki.app/Contents/MacOS/meeki", b"new")]),
        )
        .unwrap_err();

        // Restore before the assert so a failure cannot leak an undeletable dir.
        let mut perms = root.path().metadata().unwrap().permissions();
        perms.set_mode(0o700);
        fs::set_permissions(root.path(), perms).unwrap();

        assert!(
            matches!(error, crate::Error::AppNotWritable { .. }),
            "a permission problem must not tell the user to move the app: {error:?}"
        );
        assert!(!error.to_string().contains("os error"));
    }
}
