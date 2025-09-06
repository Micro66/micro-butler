const axios = require('axios');

// 拦截 fetch 请求来打印发送给模型的消息
const originalFetch = global.fetch;
global.fetch = async function(url, options) {
  console.log('\n=== API 请求拦截 ===');
  console.log('URL:', url);
  console.log('Method:', options?.method);
  console.log('Headers:', JSON.stringify(options?.headers, null, 2));
  
  if (options?.body) {
    try {
      const body = JSON.parse(options.body);
      console.log('\n=== 发送给模型的完整消息 ===');
      console.log('Model:', body.model);
      console.log('Temperature:', body.temperature);
      console.log('Max Tokens:', body.max_tokens);
      console.log('Stream:', body.stream);
      
      console.log('\n=== 消息内容 ===');
      body.messages.forEach((msg, index) => {
        console.log(`\n--- 消息 ${index + 1} (${msg.role}) ---`);
        if (typeof msg.content === 'string') {
          console.log(msg.content.substring(0, 1000) + (msg.content.length > 1000 ? '...[截断]' : ''));
        } else {
          console.log(JSON.stringify(msg.content, null, 2));
        }
      });
      
      console.log('\n=== 系统提示词 ===');
      const systemMessage = body.messages.find(msg => msg.role === 'system');
      if (systemMessage) {
        console.log('系统提示词长度:', systemMessage.content.length, '字符');
        console.log('系统提示词内容:');
        console.log(systemMessage.content);
      }
      
      console.log('\n=== 用户消息 ===');
      const userMessages = body.messages.filter(msg => msg.role === 'user');
      userMessages.forEach((msg, index) => {
        console.log(`\n用户消息 ${index + 1}:`);
        console.log(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2));
      });
      
      console.log('\n========================\n');
    } catch (e) {
      console.log('Body (raw):', options.body);
    }
  }
  
  // 调用原始的 fetch
  return originalFetch.call(this, url, options);
};

// 创建任务并启动
async function testMessages() {
  try {
    console.log('创建任务...');
    const createResponse = await axios.post('http://localhost:3000/api/tasks', {
      task: '创建一个名为test.txt的文件，内容为"Hello World"',
      workspacePath: '/tmp'
    });
    
    const taskId = createResponse.data.taskId;
    console.log('任务创建成功，ID:', taskId);
    
    console.log('\n启动任务...');
    const startResponse = await axios.post(`http://localhost:3000/api/tasks/${taskId}/start`);
    console.log('任务启动响应:', startResponse.data);
    
  } catch (error) {
    console.error('错误:', error.response?.data || error.message);
  }
}

// 运行测试
testMessages();