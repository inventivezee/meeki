use std::path::Path;

use crate::{Error, ExportInput};

pub fn export_pdf(path: impl AsRef<Path>, input: impl Into<ExportInput>) -> Result<(), Error> {
    let input = input.into();
    let typst_content = crate::typst::build_typst_content(&input);
    let pdf_bytes = crate::typst::compile_to_pdf(&typst_content)?;

    // Exporting a whole library targets a new dated folder that nothing has
    // created yet. The markdown path gets this for free from the fs plugin;
    // a bare write here failed every "export all" as PDF.
    if let Some(parent) = path.as_ref().parent() {
        std::fs::create_dir_all(parent)?;
    }

    std::fs::write(path.as_ref(), pdf_bytes)?;
    Ok(())
}
