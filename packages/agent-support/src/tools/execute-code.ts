import {
  executeCodeTool as coreExecuteCodeTool,
  formatExecutionResult,
  setExecuteCodeFunction,
} from "@meeki/agent-core";

import { executeCode } from "../modal/execute";

setExecuteCodeFunction(executeCode);

export { coreExecuteCodeTool as executeCodeTool, formatExecutionResult };
