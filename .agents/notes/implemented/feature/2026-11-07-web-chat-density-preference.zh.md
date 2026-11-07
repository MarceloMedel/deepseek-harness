# Agent Note: The chat's display density is a durable preference

Status: implemented

[English](2026-11-07-web-chat-density-preference.md) | 中文

## Problem

[活动折叠](2026-11-07-web-activity-fold-and-live-line.md)把一种展示行为变成了唯一的一种:每段工作都渲染为一行折叠行。想逐次调用跟读的读者必须逐段展开,想观察推理的读者必须逐个打开 Think 行;同一个 transcript 因此对两种相反的阅读方式都不够好。这个选择是持久的,而不是按会话的:它描述一个人怎么读,而不是某个会话包含什么。

## Decision

**`ui-conversation.chatDensity` 是一个持久的标量,接受三个值,默认 `compact`。** `compact` 把每段工作折叠成一行;`balanced` 让每个 Assistant 步骤与每次工具调用各占一行,不做折叠;`detailed` 渲染同样的行,并让每个步骤的推理默认展开。Host 的用户设置文档保存该值,与 `busyEnter` 并列,因此会随用户 home 在端口与重载之间保持一致。

**由一行常规设置写入。** `DensityRow` 以第二个 `settings.general.item` 注册在 `ui-conversation` 中,`order: 21`,使用与 Enter 行为行相同的选择器原语,并通过条目的 inject `hooks` 隔间读取实时值。

**该值以 owner 数据流到消息流。** 聊天视图的注册注入 `hooks: { density }`;`ChatView` 读取一次,决定是否折叠,并将其放入每个键控 Chat renderer 本就会收到的 `ChatNodeOwnerProps` 中。`AssistantNodeView` 把 `detailed` 转成 `expandReasoning`,由 `AssistantMarkdown` 交给每个 `ReasoningRow` 作为初始展开状态。此后该行的展开状态仍归读者自己的开关所有。

**两个已发布的偏好通过同一个入口读取各自的值。** `bindPreference` 负责从 settings scope 采纳、值未变时不回写、在写入跨网络前先本地发布,以及没有 scope 时保持进程内行为;`ComposerSubmissionPolicy` 与 `ChatDensityPreference` 各自通过它投影一个字段。设置文件更名为 `conversation-settings.ts`,因为它现在承载两个偏好,而不再只是提交策略。

**实时活动行不读取密度。** 它报告此刻正在发生什么,而每个密度都需要这个信息;只有「已经发生过什么的记录」才是口味问题。

## Alternatives considered

**按会话的密度。** 否决:同一个读者在各会话中保持同一种阅读方式,而按会话的值需要会话事件(日志是超越挂载生命周期的状态唯一归属)来保存一个用户只设置一次的偏好。

**在会话标题栏放一个快捷开关,而不是设置行。** 本次否决:标题栏已承载标题、视图页签与会话上下文控件,而这个偏好出现的频率不足以占据常驻位置。设置行是该插件另一个偏好已经在的地方。

**在 `detailed` 中展开每个工具卡片。** 否决:工具卡片的展开状态属于 `ui-tool` 中的 Tool renderer,而这项工作不扩大其公共 API;一个展开的终端卡片序列也会把它旁边的答案埋掉。`detailed` 面向的是推理。

**两个层级(折叠与不折叠)。** 否决:不折叠只是产出按步骤的行,并没有让推理变得可达,而这恰恰是折叠回答得最差的那一半需求。

**把值存放在浏览器存储中。** 否决:`MDL` 产品规则与既有偏好都把持久用户状态放在 Host 的设置文档里,因此手机与桌面共享同一个选择。

## Consequences

transcript 现在同时服务两种阅读方式,而无需新增插件或第二个视图。代价是多了一行设置,以及在一个 Host 边界校验的 schema 中多了一个字段;并且 `detailed` 在长轮次中可能很重:每个步骤的推理都铺在消息流里,因此在启用该密度时无法获得折叠的紧凑——这本就是定义,因为读者拒绝的正是紧凑。

验证:`chat-density.client.spec.tsx` 覆盖默认值、写入前发布、去重、无回写采纳以及设置行;`host.client.spec.ts` 覆盖 schema 接受与拒绝取值;`chat-view.client.spec.tsx` 覆盖两个非默认密度下的不折叠渲染;`reasoning-row.client.spec.tsx` 覆盖推理默认打开与读者关闭。`pnpm run test:gui` 通过(3815 通过,1 跳过),`tsc -b tsconfig.client.json` 与 oxlint 同样通过。这一行与三个密度的视觉评审需要浏览器,而当前环境无法启动,因此仍属人工步骤。
