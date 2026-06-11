# Reta AI Chat for Zotero

一个用于 Zotero 的 AI 文献阅读助手插件。它可以在 Zotero 右侧文献面板中提供 AI 对话区域，帮助用户基于当前文献的元数据、摘要、笔记以及可选的 PDF 全文内容进行提问、总结、解释概念、辅助论文写作和寻找相关研究方向。

> 本插件需要用户自行配置兼容 OpenAI Chat Completions 格式的 AI API 服务，例如 DeepSeek、OpenAI 兼容接口或其他自部署兼容服务。

---

## 功能特性

* 在 Zotero 右侧文献信息面板中添加 AI Chat 区域
* 支持基于当前文献的元数据、摘要、标签、笔记进行问答
* 支持可选读取当前文献附件 PDF 的全文索引
* 支持自定义 AI 服务地址、API Key 和模型名称
* 支持自定义 PDF 最大发送字符数
* 支持自定义最大输出 Token 数
* 支持 Markdown 回复渲染
* 支持 LaTeX 数学公式渲染
* 支持复制 AI 回复内容
* 支持 Zotero 插件自动更新配置

---

## 使用场景

你可以用它来完成以下任务：

* 总结当前论文的研究问题、研究方法和核心结论
* 提取论文的理论贡献、数据来源和研究局限
* 解释论文中的概念、模型、变量关系和统计方法
* 根据当前文献生成文献综述段落
* 根据当前文献主题寻找相关研究方向
* 为论文写作生成可参考的学术表述
* 快速询问当前 PDF 中的具体内容

---

## 安装方法

### 方法一：从 Release 安装

1. 打开本项目的 GitHub Releases 页面
2. 下载最新版本的 `.xpi` 文件
3. 打开 Zotero
4. 进入：

```text
Tools → Plugins
```

5. 点击右上角齿轮按钮
6. 选择：

```text
Install Plugin From File...
```

7. 选择下载好的 `.xpi` 文件
8. 重启 Zotero

安装完成后，选中一篇普通文献条目，右侧文献面板中会出现 AI Chat 区域。

---

## 配置方法

安装插件后，进入 Zotero，选中一篇文献，在右侧 AI Chat 面板中点击：

```text
配置
```

你需要填写：

| 配置项             | 说明                                             |
| ------------------ | ------------------------------------------------ |
| AI 服务地址        | 兼容 OpenAI Chat Completions 格式的 API 地址     |
| API Key            | 用户自己的 API Key                               |
| 模型名称           | 要调用的模型名称                                 |
| PDF 最大发送字符数 | 启用 PDF 全文回答时，最多发送给模型的 PDF 字符数 |
| 最大输出 Token 数  | AI 回复的最大输出 token 数                       |

示例配置：

```text
AI 服务地址：https://api.deepseek.com
模型名称：deepseek-chat
```

API Key 需要使用你自己的服务商 Key。本插件不会提供内置 API Key。

---

## PDF 全文回答

插件面板中有一个选项：

```text
基于 PDF 全文回答
```

启用后，插件会尝试读取当前 Zotero 文献附件中的 PDF 全文索引，并将清洗和截断后的文本作为上下文发送给 AI 服务。

注意：

* 插件读取的是 Zotero 已建立索引的附件文本
* 如果 Zotero 没有成功索引 PDF，插件可能无法读取全文
* 如果 PDF 文本过长，会按照配置中的“PDF 最大发送字符数”截断
* PDF 全文内容会被发送到你配置的 AI API 服务地址

如果你处理的是未公开论文、商业文档、隐私材料或敏感资料，请谨慎启用 PDF 全文回答。

---

## 隐私说明

本插件不会内置任何 API Key，也不会将数据发送到插件作者的服务器。

插件会在以下情况下向你配置的 AI 服务发送数据：

1. 你在 AI Chat 面板中发送问题
2. 插件会将当前文献的元数据、摘要、标签、笔记作为上下文发送
3. 如果你启用了“基于 PDF 全文回答”，插件还会发送当前文献 PDF 的部分全文内容

本插件保存的配置包括：

* AI 服务地址
* API Key
* 模型名称
* 是否启用 PDF 全文回答
* PDF 最大发送字符数
* 最大输出 Token 数

这些配置保存在用户本机 Zotero 的偏好设置中，不会写入插件安装包，也不会随插件发布给其他用户。

请不要在不信任的 API 服务中使用敏感文献内容。

---

## 项目结构

```text
reta-ai-chat/
├─ manifest.json
├─ bootstrap.js
├─ prefs.js
├─ content/ 或 modules/
│  ├─ constants.js
│  ├─ utils.js
│  ├─ markdown.js
│  ├─ settings.js
│  ├─ context.js
│  ├─ api.js
│  └─ ui.js
├─ icons/
│  └─ ai.svg
├─ locale/
│  └─ zh-CN/
│     └─ reta-ai-chat.ftl
└─ lib/
   ├─ marked.umd.js
   ├─ purify.min.js
   └─ katex/
      ├─ katex.min.js
      ├─ katex.min.css
      └─ contrib/
         └─ auto-render.min.js
```

其中：

| 文件或目录               | 作用                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `manifest.json`          | 插件元信息，包括名称、版本、ID、兼容 Zotero 版本和更新地址 |
| `bootstrap.js`           | Zotero 插件启动入口，负责加载模块、注册和注销插件面板      |
| `prefs.js`               | 插件默认偏好设置                                           |
| `content/` 或 `modules/` | 插件主要功能代码                                           |
| `icons/`                 | 插件图标                                                   |
| `locale/`                | 本地化语言文件                                             |
| `lib/`                   | Markdown、HTML 清洗和 LaTeX 渲染依赖库                     |

---

## 开发环境

推荐使用：

* Zotero 7 或更高版本
* VS Code
* PowerShell 或其他命令行工具
* Git

开发时可以使用 Zotero 的开发插件加载方式，也可以手动打包为 `.xpi` 后安装测试。

---

## 打包方法

在插件根目录执行，也就是能直接看到 `manifest.json`、`bootstrap.js`、`icons`、`lib` 等文件夹的目录。

如果项目中有 `prefs.js`：

```powershell
Remove-Item reta-ai-chat.zip,reta-ai-chat.xpi -ErrorAction SilentlyContinue
Compress-Archive -Path manifest.json,bootstrap.js,prefs.js,icons,locale,lib,content -DestinationPath reta-ai-chat.zip -Force
Rename-Item reta-ai-chat.zip reta-ai-chat.xpi
```

如果你使用的是 `modules/` 文件夹：

```powershell
Remove-Item reta-ai-chat.zip,reta-ai-chat.xpi -ErrorAction SilentlyContinue
Compress-Archive -Path manifest.json,bootstrap.js,prefs.js,icons,locale,lib,modules -DestinationPath reta-ai-chat.zip -Force
Rename-Item reta-ai-chat.zip reta-ai-chat.xpi
```

如果没有 `prefs.js`，请从命令中删除 `prefs.js`。

打包完成后，`.xpi` 内部第一层应当直接包含：

```text
manifest.json
bootstrap.js
icons/
locale/
lib/
content/ 或 modules/
```

不要把整个项目外层文件夹套进 `.xpi` 中。

错误示例：

```text
reta-ai-chat.xpi
└─ reta-ai-chat/
   ├─ manifest.json
   ├─ bootstrap.js
   └─ ...
```

正确示例：

```text
reta-ai-chat.xpi
├─ manifest.json
├─ bootstrap.js
├─ icons/
├─ locale/
├─ lib/
└─ content/ 或 modules/
```

---

## 自动更新

插件可以通过 `updates.json` 实现自动更新。

`manifest.json` 中需要配置：

```json
{
  "applications": {
    "zotero": {
      "id": "reta-ai-chat@example.com",
      "update_url": "https://raw.githubusercontent.com/你的用户名/你的仓库/main/updates.json",
      "strict_min_version": "7.0",
      "strict_max_version": "10.0.*"
    }
  }
}
```

仓库根目录中的 `updates.json` 示例：

```json
{
  "addons": {
    "reta-ai-chat@example.com": {
      "updates": [
        {
          "version": "1.0.1",
          "update_link": "https://github.com/你的用户名/你的仓库/releases/download/v1.0.1/reta-ai-chat-1.0.1.xpi",
          "applications": {
            "zotero": {
              "strict_min_version": "7.0",
              "strict_max_version": "10.0.*"
            }
          }
        }
      ]
    }
  }
}
```

每次发布新版时，需要同步修改：

1. `manifest.json` 中的 `version`
2. `updates.json` 中的 `version`
3. `updates.json` 中的 `update_link`
4. GitHub Release 中上传对应版本的 `.xpi` 文件

---

## 常见问题

### 1. 安装时提示版本不兼容

请检查 `manifest.json` 中的：

```json
"strict_min_version": "7.0",
"strict_max_version": "10.0.*"
```

如果你的 Zotero 版本高于 `strict_max_version`，插件会被判定为不兼容。

---

### 2. 打包后图标不显示

请检查 `.xpi` 内部是否包含：

```text
icons/ai.svg
```

或者你在代码中配置的对应 PNG 文件。

同时确认 `bootstrap.js` 中的图标路径和实际文件路径完全一致。

---

### 3. 打包后 Markdown 没有渲染

请检查 `.xpi` 内部是否包含：

```text
lib/marked.umd.js
lib/purify.min.js
```

如果这些文件缺失，AI 回复会以 Markdown 源码形式显示。

---

### 4. 配置窗口里显示了旧的 API Key

这是因为 Zotero 会把插件配置保存到当前用户本机的偏好设置中。重新安装插件通常不会自动清除这些配置。

这些配置不会被写入 `.xpi`，也不会被发送给其他用户。

---

### 5. 为什么别人安装后没有我的 API Key？

API Key 保存在每个用户自己电脑上的 Zotero 偏好设置中，不包含在插件安装包里。别人安装插件后需要自行填写自己的 API Key。

---

## 许可证

本项目采用 MIT License。你可以自由使用、修改和分发本项目代码，但请保留原始许可证说明。

---

## 免责声明

本插件是一个第三方 Zotero 插件，不隶属于 Zotero 官方项目。

AI 生成内容可能存在错误、遗漏或不准确之处。请在学术研究、论文写作和引用文献时自行核对原文与可靠来源。

使用本插件时，请遵守你所使用的 AI 服务商的服务条款，并谨慎处理敏感文献和隐私数据。

---

## 致谢

本插件使用或兼容以下开源库：

* marked：用于 Markdown 解析
* DOMPurify：用于 HTML 清洗
* KaTeX：用于 LaTeX 数学公式渲染

感谢 Zotero 社区和开源插件开发者提供的参考与启发。