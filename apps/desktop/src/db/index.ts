import { createDb } from "@meeki/db";
import { createUseDrizzleLiveQuery, createUseLiveQuery } from "@meeki/db-react";
import { tauriLiveQueryClient, tauriTransactionClient } from "@meeki/db-tauri";

export const liveQueryClient = tauriLiveQueryClient;
export const db = createDb(liveQueryClient);
export const useLiveQuery = createUseLiveQuery(liveQueryClient);
export const useDrizzleLiveQuery = createUseDrizzleLiveQuery(liveQueryClient);
export const executeTransaction = tauriTransactionClient.executeTransaction;
