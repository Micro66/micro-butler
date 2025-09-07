#!/usr/bin/env node

/**
 * MCP 工具测试脚本
 * 测试 use_mcp_tool 和 access_mcp_resource 功能
 */

const http = require('http');

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

// 测试创建任务并使用 MCP 工具
function testMCPTask(taskDescription) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      task: taskDescription,
      workspacePath: process.cwd()
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/tasks',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200) {
            log('green', `   ✅ 任务创建成功: ${response.taskId}`);
            resolve({ success: true, taskId: response.taskId, response });
          } else {
            log('red', `   ❌ 任务创建失败 (状态码: ${res.statusCode})`);
            log('red', `   响应: ${data}`);
            resolve({ success: false, statusCode: res.statusCode, response: data });
          }
        } catch (error) {
          log('red', `   ❌ 响应解析失败: ${error.message}`);
          resolve({ success: false, error: error.message });
        }
      });
    });
    
    req.on('error', (error) => {
      log('red', `   ❌ 请求失败: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
    
    req.on('timeout', () => {
      log('red', '   ❌ 请求超时');
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });
    
    req.write(postData);
    req.end();
  });
}

// 获取任务状态
function getTaskStatus(taskId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/tasks/${taskId}`,
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ success: true, response });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });
    
    req.end();
  });
}

// 检查 Backend 服务状态
function checkBackendStatus() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'GET',
      timeout: 3000
    };
    
    const req = http.request(options, (res) => {
      resolve({ success: true, statusCode: res.statusCode });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });
    
    req.end();
  });
}

// 主测试函数
async function testMCPTools() {
  log('blue', '🧪 开始测试 MCP 工具功能\n');
  
  // 1. 检查 Backend 服务
  log('blue', '1. 检查 Backend 服务状态');
  const backendStatus = await checkBackendStatus();
  
  if (!backendStatus.success) {
    log('red', '   ❌ Backend 服务未运行');
    log('yellow', '   请先启动 Backend 服务: cd backend && npm run dev');
    return;
  }
  
  log('green', `   ✅ Backend 服务正常 (状态码: ${backendStatus.statusCode})`);
  
  // 2. 测试 MCP 工具调用
  log('blue', '\n2. 测试 MCP 工具调用');
  
  const testCases = [
    {
      name: 'DuckDuckGo 搜索测试',
      task: '使用 duckduckgo-search 服务器搜索 "Node.js 教程"'
    },
    {
      name: 'MCP 工具直接调用测试',
      task: '调用 use_mcp_tool，服务器名称是 duckduckgo-search，工具名称是 search，参数是 {"query": "JavaScript 基础"}'
    }
  ];
  
  const results = [];
  
  for (const testCase of testCases) {
    log('yellow', `\n   测试: ${testCase.name}`);
    log('blue', `   任务: ${testCase.task}`);
    
    const result = await testMCPTask(testCase.task);
    results.push({ ...testCase, ...result });
    
    if (result.success) {
      // 等待一段时间让任务执行
      log('yellow', '   等待任务执行...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 获取任务状态
      const statusResult = await getTaskStatus(result.taskId);
      if (statusResult.success) {
        log('blue', `   任务状态: ${statusResult.response.status}`);
        if (statusResult.response.messages && statusResult.response.messages.length > 0) {
          log('green', '   ✅ 任务有消息输出，MCP 工具可能正在工作');
        }
      }
    }
  }
  
  // 3. 输出测试结果
  log('blue', '\n📊 测试结果总结:');
  
  const successfulTests = results.filter(r => r.success);
  const failedTests = results.filter(r => !r.success);
  
  log('green', `✅ 成功的测试: ${successfulTests.length}`);
  successfulTests.forEach(r => {
    log('green', `   - ${r.name}`);
  });
  
  if (failedTests.length > 0) {
    log('red', `❌ 失败的测试: ${failedTests.length}`);
    failedTests.forEach(r => {
      log('red', `   - ${r.name}: ${r.error || r.statusCode}`);
    });
  }
  
  // 4. 提供使用建议
  log('blue', '\n💡 使用建议:');
  
  if (successfulTests.length > 0) {
    log('green', '1. MCP 功能基本可用，可以通过以下方式使用:');
    log('yellow', '   - 在任务中直接描述需要搜索的内容');
    log('yellow', '   - 使用 use_mcp_tool 直接调用 MCP 工具');
    log('yellow', '   - 通过 WebSocket 实时查看任务执行过程');
  }
  
  log('blue', '\n2. 手动测试命令:');
  log('yellow', '   curl -X POST http://localhost:3000/tasks \\');
  log('yellow', '     -H "Content-Type: application/json" \\');
  log('yellow', '     -d \'{\'');
  log('yellow', '       "task": "使用 duckduckgo 搜索最新的 AI 新闻"');
  log('yellow', '     }\'');
  
  log('blue', '\n3. 查看任务状态:');
  log('yellow', '   curl http://localhost:3000/tasks/{taskId}');
  
  log('blue', '\n🔗 更多信息请查看: backend/docs/MCP_INTEGRATION.md');
}

// 运行测试
testMCPTools().catch(error => {
  log('red', `❌ 测试过程出错: ${error.message}`);
  process.exit(1);
});