import type {
  DrizzleProxyClient,
  LiveQueryClient,
  TransactionClient,
} from "@meeki/db-runtime";
import {
  execute,
  executeProxy,
  executeTransaction,
  subscribe,
} from "@meeki/plugin-db";

export const tauriLiveQueryClient: LiveQueryClient & DrizzleProxyClient = {
  execute,
  executeProxy,
  subscribe,
};

export const tauriTransactionClient: TransactionClient = {
  executeTransaction,
};
