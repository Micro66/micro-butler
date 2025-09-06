# 配置文件说明

## 配置文件位置

系统会按以下优先级查找配置文件：

1. **用户配置目录**（推荐）：`~/.micro-butler/config/app.json`
2. **环境变量指定**：`$CONFIG_DIR/app.json`
3. **项目配置目录**：`./config/app.json`

## 初始化配置

首次使用时，请将 `app.json` 复制到用户配置目录：

```bash
# 创建配置目录
mkdir -p ~/.micro-butler/config/

# 复制配置文件
cp backend/config/app.json ~/.micro-butler/config/
```

## 配置 API 密钥

编辑 `~/.micro-butler/config/app.json` 文件，填入你的 API 密钥：

```json
{
  "defaultApiConfiguration": {
    "apiKey": "your-actual-api-key-here"
  },
  "apiConfigurations": {
    "siliconflow": {
      "apiKey": "your-siliconflow-api-key"
    },
    "openai": {
      "apiKey": "your-openai-api-key"
    }
  }
}
```

## 注意事项

- 用户配置目录的配置文件不会被 Git 跟踪，确保 API 密钥安全
- 项目中的 `app.json` 仅作为示例配置，请勿在其中填入真实的 API 密钥
- 配置文件支持热重载，修改后会自动生效