# 群聊功能测试指南

本文档说明如何在一台电脑上测试群聊功能。

## 核心原理

应用使用 `localStorage` 存储用户身份（`waku-chat-identity`）。每个浏览器实例（或浏览器配置文件）都有独立的 `localStorage`，因此可以模拟多个不同的用户。

## 测试方法

### 方法一：使用不同的浏览器（推荐）

这是最简单的方法，每个浏览器都有独立的 `localStorage`：

1. **启动应用**
   ```bash
   npm run dev
   ```

2. **打开多个浏览器**
   - Chrome: `http://localhost:5173`
   - Firefox: `http://localhost:5173`
   - Edge: `http://localhost:5173`
   - 或其他浏览器

3. **测试步骤**
   - 在浏览器 A 中创建群聊，复制群聊会话 ID
   - 在浏览器 B 和 C 中使用该会话 ID 加入群聊
   - 在任意浏览器中发送消息，其他浏览器应该能收到

### 方法二：使用无痕/隐私模式

每个无痕窗口也有独立的 `localStorage`：

1. **启动应用**
   ```bash
   npm run dev
   ```

2. **打开多个无痕窗口**
   - Chrome: `Ctrl+Shift+N` (Windows) 或 `Cmd+Shift+N` (Mac)
   - Firefox: `Ctrl+Shift+P` (Windows) 或 `Cmd+Shift+P` (Mac)
   - Edge: `Ctrl+Shift+N` (Windows) 或 `Cmd+Shift+N` (Mac)

3. **测试步骤**
   - 在无痕窗口 A 中创建群聊，复制群聊会话 ID
   - 在无痕窗口 B 和 C 中使用该会话 ID 加入群聊
   - 在任意窗口中发送消息，其他窗口应该能收到

### 方法三：使用浏览器开发者工具清除身份

在同一个浏览器中，通过清除 `localStorage` 来切换身份：

1. **打开应用**
   ```bash
   npm run dev
   ```

2. **打开浏览器开发者工具**
   - Chrome/Edge: `F12` 或 `Ctrl+Shift+I`
   - Firefox: `F12` 或 `Ctrl+Shift+I`

3. **清除身份并重新加载**
   - 在 Console 中执行：
     ```javascript
     localStorage.removeItem('waku-chat-identity');
     location.reload();
     ```
   - 或者：
     - 打开 Application/Storage 标签
     - 找到 Local Storage → `http://localhost:5173`
     - 删除 `waku-chat-identity` 项
     - 刷新页面

4. **测试步骤**
   - 在标签页 A 中创建群聊，复制群聊会话 ID
   - 在标签页 B 中清除身份并重新加载，然后加入群聊
   - 在标签页 C 中清除身份并重新加载，然后加入群聊
   - 在任意标签页中发送消息，其他标签页应该能收到

### 方法四：使用浏览器配置文件（高级）

某些浏览器支持创建多个配置文件，每个配置文件有独立的 `localStorage`：

**Chrome/Edge:**
1. 打开 `chrome://settings/manageProfile` 或 `edge://settings/manageProfile`
2. 创建新配置文件
3. 使用不同配置文件打开应用

**Firefox:**
1. 使用 `firefox -ProfileManager` 启动
2. 创建新配置文件
3. 使用不同配置文件打开应用

## 完整测试流程示例

### 场景：3人群聊测试

1. **准备环境**
   ```bash
   # 启动本地 Waku 节点（可选，但推荐）
   npm run start-waku
   
   # 启动应用
   npm run dev
   ```

2. **用户 A（创建群聊）**
   - 打开浏览器 A（如 Chrome）
   - 访问 `http://localhost:5173`
   - 切换到"创建 / 加入"页面
   - 选择"群聊"类型
   - 输入群名称（如"测试群"）
   - 点击"创建群聊"
   - 复制显示的群聊会话 ID（UUID 格式）

3. **用户 B（加入群聊）**
   - 打开浏览器 B（如 Firefox）
   - 访问 `http://localhost:5173`
   - 切换到"创建 / 加入"页面
   - 在"加入群聊"部分粘贴会话 ID
   - 输入本地显示名称（可选）
   - 点击"加入群聊"

4. **用户 C（加入群聊）**
   - 打开浏览器 C（如 Edge）
   - 重复用户 B 的步骤

5. **测试消息发送**
   - 在用户 A 的浏览器中切换到"聊天"页面
   - 选择创建的群聊
   - 发送消息："大家好，我是用户A"
   - 在用户 B 和 C 的浏览器中应该能看到这条消息

6. **测试消息接收**
   - 在用户 B 的浏览器中发送消息："你好，我是用户B"
   - 在用户 A 和 C 的浏览器中应该能看到这条消息

7. **测试消息撤回**
   - 在用户 A 的浏览器中点击某条自己发送的消息的"撤回"按钮
   - 在用户 B 和 C 的浏览器中，该消息应该显示为"该消息已被撤回"

8. **测试退出群聊**
   - 在用户 C 的浏览器中点击"退出会话"按钮
   - 在用户 A 和 B 的浏览器中应该能看到系统消息："用户 XXX 已退出会话"

## 验证要点

- ✅ 每个浏览器实例有独立的身份（不同的 peerId）
- ✅ 群聊会话 ID 可以跨浏览器共享
- ✅ 消息能在所有加入群聊的浏览器中同步显示
- ✅ 消息撤回功能正常工作
- ✅ 退出群聊功能正常工作
- ✅ 消息加密和解密正常工作（消息内容正确显示）

## 常见问题

### Q: 为什么同一个浏览器的多个标签页显示相同的身份？

A: 因为 `localStorage` 在同一浏览器的所有标签页之间是共享的。要测试多个用户，请使用不同的浏览器或使用无痕模式。

### Q: 消息没有同步到其他浏览器？

A: 检查以下几点：
1. 确保本地 Waku 节点正在运行（`npm run start-waku`）
2. 检查浏览器控制台是否有错误信息
3. 确保所有浏览器都加入了同一个群聊（使用相同的会话 ID）
4. 检查网络连接是否正常

### Q: 如何查看当前用户的 peerId？

A: 在应用顶部显示的是当前用户的 peerId（前12个字符），点击"复制 peerId"按钮可以复制完整的 peerId。

### Q: 如何重置身份？

A: 在浏览器开发者工具的 Console 中执行：
```javascript
localStorage.removeItem('waku-chat-identity');
location.reload();
```

## 自动化测试

项目包含单元测试，可以运行：

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch
```

测试文件位于 `src/__tests__/` 目录下。
