import type { Session } from "@relay/shared-types";

const TIMELINE_MEMORY_PROMPT_VERSION = "timeline-memory/v1";

function buildTimelineMemoryPrompt(session: Session, checkpointTurnCount: number) {
  const transcript = session.messages
    .map((message) => {
      const role = message.role.toUpperCase();
      return `[${message.sequence}] ${role}\n${message.content}`.trim();
    })
    .join("\n\n");

  return [
    `你正在为 Relay 生成“时间线记忆”。`,
    `当前 session 主题：${session.title}`,
    `当前 checkpoint：第 ${checkpointTurnCount} 条用户消息。`,
    "",
    "请整理成一份可长期复用的时间线记忆。",
    "如果对话实际涉及多个主题，不要混在一条线里硬写；请按主题拆分组织，每个主题下再分别写时间线摘要、用户决策、关注点地图。",
    "如果只有一个主题，就直接围绕当前 session 主题组织。",
    "",
    "要求：",
    "- 先按主题组织，再在主题内按时间线梳理。",
    "- 保留关键文件路径和动作。",
    "- 不要杜撰用户理由。",
    "- 用户决策里只提取用户明确做出的决策和理由；若理由没明说就不要补。",
    "- 关注点地图要明确写出用户真正关注什么、不关注什么。",
    "- 不要输出与本 session 无关的泛化建议。",
    "",
    "建议输出结构：",
    "1. 主题：<主题名>",
    "   - 时间线摘要",
    "   - 用户决策",
    "   - 关注点地图",
    "2. 如果还有第二个主题，继续按同样结构写。",
    "",
    "以下是当前 session 对话：",
    transcript,
  ].join("\n");
}

export { TIMELINE_MEMORY_PROMPT_VERSION, buildTimelineMemoryPrompt };
