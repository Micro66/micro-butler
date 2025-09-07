#!/usr/bin/env node

/**
 * MCP 功能验证脚本
 * 用于测试 MCP 服务器连接和工具调用功能
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 读取配置文件
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../config/app.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (error) {
    log('red', `❌ 无法读取配置文件: ${error.message}`);
    process.exit(1);
  }
}

// 测试 MCP 服务器连接
function testMCPServer(serverName, serverConfig) {
  return new Promise((resolve) => {
    log('blue', `\n🔍 测试 MCP 服务器: ${serverName}`);
    log('yellow', `   命令: ${serverConfig.command} ${serverConfig.args?.join(' ') || ''}`);
    
    const child = spawn(serverConfig.command, serverConfig.args || [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    // 设置超时
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      log('yellow', '   ⚠️  服务器启动超时 (5秒)');
      resolve({ success: false, reason: 'timeout' });
    }, 5000);
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        log('green', '   ✅ 服务器启动成功');
        resolve({ success: true, output });
      } else {
        log('red', `   ❌ 服务器启动失败 (退出码: ${code})`);
        if (errorOutput) {
          log('red', `   错误信息: ${errorOutput.trim()}`);
        }
        resolve({ success: false, reason: 'exit_code', code, error: errorOutput });
      }
    });
    
    child.on('error', (error) => {
      clearTimeout(timeout);
      log('red', `   ❌ 服务器启动错误: ${error.message}`);
      resolve({ success: false, reason: 'spawn_error', error: error.message });
    });
    
    // 发送初始化消息测试 MCP 协议
    setTimeout(() => {
      try {
        const initMessage = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            clientInfo: {
              name: 'micro-butler-test',
              version: '1.0.0'
            }
          }
        }) + '\n';
        
        child.stdin.write(initMessage);
      } catch (error) {
        log('yellow', `   ⚠️  无法发送初始化消息: ${error.message}`);
      }
    }, 1000);
  });
}

// 测试 Backend API
function testBackendAPI() {
  return new Promise((resolve) => {
    log('blue', '\n🔍 测试 Backend API 连接');
    
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          log('green', '   ✅ Backend API 连接成功');
          resolve({ success: true });
        } else {
          log('red', `   ❌ Backend API 响应错误 (状态码: ${res.statusCode})`);
          resolve({ success: false, statusCode: res.statusCode });
        }
      });
    });
    
    req.on('error', (error) => {
      log('red', `   ❌ Backend API 连接失败: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
    
    req.on('timeout', () => {
      log('red', '   ❌ Backend API 连接超时');
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });
    
    req.end();
  });
}

// 主验证函数
async function verifyMCP() {
  log('blue', '🚀 开始验证 MCP 功能\n');
  
  // 1. 读取配置
  const config = loadConfig();
  
  // 2. 检查 MCP 配置
  if (!config.mcp || !config.mcp.enabled) {
    log('yellow', '⚠️  MCP 功能未启用，请在配置中设置 mcp.enabled = true');
  }
  
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    log('red', '❌ 未找到 MCP 服务器配置');
    return;
  }
  
  log('green', `✅ 找到 ${Object.keys(config.mcpServers).length} 个 MCP 服务器配置`);
  
  // 3. 测试每个 MCP 服务器
  const results = [];
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    if (serverConfig.disabled) {
      log('yellow', `⚠️  服务器 ${serverName} 已禁用，跳过测试`);
      continue;
    }
    
    const result = await testMCPServer(serverName, serverConfig);
    results.push({ serverName, ...result });
  }
  
  // 4. 测试 Backend API
  const apiResult = await testBackendAPI();
  
  // 5. 输出总结
  log('blue', '\n📊 验证结果总结:');
  
  const successfulServers = results.filter(r => r.success);
  const failedServers = results.filter(r => !r.success);
  
  log('green', `✅ 成功的服务器: ${successfulServers.length}`);
  successfulServers.forEach(r => {
    log('green', `   - ${r.serverName}`);
  });
  
  if (failedServers.length > 0) {
    log('red', `❌ 失败的服务器: ${failedServers.length}`);
    failedServers.forEach(r => {
      log('red', `   - ${r.serverName}: ${r.reason}`);
    });
  }
  
  log(apiResult.success ? 'green' : 'red', 
      `${apiResult.success ? '✅' : '❌'} Backend API: ${apiResult.success ? '正常' : '异常'}`);
  
  // 6. 提供下一步建议
  log('blue', '\n💡 下一步建议:');
  
  if (successfulServers.length > 0) {
    log('green', '1. 可以通过以下方式测试 MCP 工具调用:');
    log('yellow', '   curl -X POST http://localhost:3000/tasks \\');
    log('yellow', '     -H "Content-Type: application/json" \\');
    log('yellow', '     -d \'{\'');
    log('yellow', '       "task": "使用 duckduckgo 搜索 \'Node.js 教程\'"');
    log('yellow', '     }\'');
  }
  
  if (failedServers.length > 0) {
    log('yellow', '2. 修复失败的服务器:');
    failedServers.forEach(r => {
      if (r.reason === 'spawn_error') {
        log('yellow', `   - ${r.serverName}: 检查命令是否正确安装`);
        log('yellow', `     尝试运行: ${config.mcpServers[r.serverName].command} ${config.mcpServers[r.serverName].args?.join(' ') || ''}`);
      } else if (r.reason === 'timeout') {
        log('yellow', `   - ${r.serverName}: 服务器启动缓慢，可能需要安装依赖`);
      }
    });
  }
  
  if (!apiResult.success) {
    log('yellow', '3. 启动 Backend 服务:');
    log('yellow', '   cd backend && npm run dev');
  }
  
  log('blue', '\n🔗 更多信息请查看: backend/docs/MCP_INTEGRATION.md');
}

// 运行验证
verifyMCP().catch(error => {
  log('red', `❌ 验证过程出错: ${error.message}`);
  process.exit(1);
});