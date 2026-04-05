# 08 Relay v0.2.0-alpha 账号与设备绑定 TDD 执行计划

## 1. 目标

把 Relay 从“网页登录成功”推进到“网页登录后具备设备绑定前置能力”。

本计划关注的是：

- 身份建模
- 设备建模
- 数据库 schema
- 本地 bridge 与 Web 的最小接线

---

## 2. 本轮验收标准

- `relay_session` 能读取当前登录用户信息
- `GET /api/auth/session` 返回 `method / provider / userId`
- `GET /device` 返回稳定本地设备信息
- `GET /api/bridge/device` 可用
- 设置页能展示账号与设备基础信息
- Supabase schema 已写入仓库

---

## 3. TDD 拆分

### 阶段 A：session 身份建模

先写 / 更新测试：

- `auth-session.test.ts`
  - token 可带 `userId`
  - token 可带 `method`
  - token 可解析为 session actor

再实现：

- `apps/web/src/lib/auth/session.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/supabase-session/route.ts`
- `apps/web/src/app/api/auth/session/route.ts`

### 阶段 B：local device 建模

先写测试：

- `services/local-bridge/tests/integration/device-route.test.ts`
  - `/device` 返回设备对象
  - 连续请求返回稳定 `deviceId`

再实现：

- `packages/shared-types/src/device.ts`
- `services/local-bridge/src/services/local-device-service.ts`
- `services/local-bridge/src/routes/device.ts`
- `services/local-bridge/src/services/relay-state-store.ts`
- `apps/web/src/app/api/bridge/device/route.ts`

### 阶段 C：设置页接线

验证方式：

- 构建通过
- 页面加载不报错
- 设置页能展示账号与设备信息

实现：

- `apps/web/src/components/settings-page-client.tsx`
- `apps/web/src/config/messages.ts`
- `apps/web/src/app/globals.css`

### 阶段 D：云端 schema

产出：

- `supabase/migrations/20260405090000_device_binding_mvp.sql`

覆盖对象：

- `devices`
- `device_bind_codes`
- `user_device_preferences`
- `RLS policies`

---

## 4. 本轮明确不做

- 绑定码 UI 交互闭环
- bridge 主动访问 Supabase
- 设备在线心跳同步到云端
- 默认设备选择 UI
- 按 `deviceId` 路由执行

---

## 5. 下一轮接续任务

1. `POST /api/devices/bind-codes`
2. `POST /device/bind`
3. settings 页增加“绑定当前设备”
4. 设备列表与默认设备选择
