import type { IncomingMessage, ServerResponse } from "node:http";

import type { GoalAutomationRuleInput } from "@relay/shared-types";

import { readJsonBody } from "./json-body";
import { AutomationService } from "../services/automation-service";

async function handleAutomationsRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  automationService: AutomationService,
) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/automations") {
    writeJson(response, 200, { items: automationService.listActiveWorkspaceRules() });
    return true;
  }

  if (request.method === "POST" && pathname === "/automations") {
    const body = await readJsonBody<GoalAutomationRuleInput & { kind?: string }>(request);

    if (body.kind !== "goal-loop") {
      writeJson(response, 400, { error: "Unsupported automation kind" });
      return true;
    }

    writeJson(response, 200, { item: automationService.createGoalRule(body) });
    return true;
  }

  if (pathname.startsWith("/automations/") && pathname.endsWith("/runs")) {
    const ruleId = pathname.replace("/automations/", "").replace("/runs", "");

    if (request.method === "GET") {
      const limit = Number(requestUrl.searchParams.get("limit") ?? "10");
      writeJson(response, 200, { items: automationService.listGoalRuns(ruleId, limit) });
      return true;
    }
  }

  if (pathname.startsWith("/automations/") && pathname.endsWith("/start")) {
    const ruleId = pathname.replace("/automations/", "").replace("/start", "");

    if (request.method === "POST") {
      writeJson(response, 200, { item: automationService.startRule(ruleId) });
      return true;
    }
  }

  if (pathname.startsWith("/automations/") && pathname.endsWith("/stop")) {
    const ruleId = pathname.replace("/automations/", "").replace("/stop", "");

    if (request.method === "POST") {
      writeJson(response, 200, { item: automationService.stopRule(ruleId) });
      return true;
    }
  }

  if (pathname.startsWith("/automations/")) {
    const ruleId = pathname.replace("/automations/", "");

    if (request.method === "PATCH") {
      const body = await readJsonBody<GoalAutomationRuleInput>(request);
      writeJson(response, 200, { item: automationService.updateGoalRule(ruleId, body) });
      return true;
    }

    if (request.method === "DELETE") {
      writeJson(response, 200, { ok: automationService.deleteRule(ruleId) });
      return true;
    }
  }

  return false;
}

function writeJson(
  response: ServerResponse<IncomingMessage>,
  status: number,
  body: Record<string, unknown>,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export { handleAutomationsRoute };
