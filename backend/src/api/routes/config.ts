import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ConfigManager } from '@/config/ConfigManager';
import { ApiConfiguration, ApiProvider } from '@/types';
import { AppLogger } from '@/utils/Logger';

interface ConfigRouteOptions {
  logger: AppLogger;
  configManager: ConfigManager;
}

export async function configRoutes(fastify: FastifyInstance, options: ConfigRouteOptions) {
  const { logger, configManager } = options;

  /**
   * GET /config
   * 获取完整配置
   */
  fastify.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = configManager.getConfig();
      
      // 隐藏敏感信息
      const safeConfig = {
        ...config,
        defaultApiConfiguration: {
          ...config.defaultApiConfiguration,
          apiKey: config.defaultApiConfiguration.apiKey ? '***' : ''
        },
        apiConfigurations: Object.entries(config.apiConfigurations || {}).reduce((acc, [key, value]) => {
          acc[key] = {
            ...value,
            apiKey: value.apiKey ? '***' : ''
          };
          return acc;
        }, {} as Record<string, ApiConfiguration>)
      };
      
      return {
        success: true,
        data: safeConfig
      };
    } catch (error) {
      logger.error('Failed to get configuration', { error: error instanceof Error ? error.message : error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to get configuration'
      };
    }
  });

  /**
   * GET /config/providers
   * 获取所有AI提供商配置
   */
  fastify.get('/config/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiConfigurations = configManager.getAllApiConfigurations();
      
      // 隐藏API密钥
      const safeConfigurations = Object.entries(apiConfigurations).reduce((acc, [key, value]) => {
        acc[key] = {
          ...value,
          apiKey: value.apiKey ? '***' : ''
        };
        return acc;
      }, {} as Record<string, ApiConfiguration>);
      
      return {
        success: true,
        data: safeConfigurations
      };
    } catch (error) {
      logger.error('Failed to get API configurations', { error: error instanceof Error ? error.message : error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to get API configurations'
      };
    }
  });

  /**
   * GET /config/providers/:provider
   * 获取指定提供商配置
   */
  fastify.get<{ Params: { provider: string } }>('/config/providers/:provider', async (request, reply) => {
    try {
      const { provider } = request.params;
      const apiConfiguration = configManager.getApiConfiguration(provider);
      
      if (!apiConfiguration) {
        reply.status(404);
        return {
          success: false,
          error: `API configuration for provider '${provider}' not found`
        };
      }
      
      // 隐藏API密钥
      const safeConfiguration = {
        ...apiConfiguration,
        apiKey: apiConfiguration.apiKey ? '***' : ''
      };
      
      return {
        success: true,
        data: safeConfiguration
      };
    } catch (error) {
      logger.error('Failed to get API configuration', { 
        provider: request.params.provider,
        error: error instanceof Error ? error.message : error 
      });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to get API configuration'
      };
    }
  });

  /**
   * PUT /config/providers/:provider
   * 设置或更新指定提供商配置
   */
  fastify.put<{ Params: { provider: string }, Body: ApiConfiguration }>('/config/providers/:provider', async (request, reply) => {
    try {
      const { provider } = request.params;
      const configuration = request.body;
      
      // 验证提供商
      const validProviders: ApiProvider[] = ['anthropic', 'openai', 'google', 'ollama'];
      if (!validProviders.includes(provider as ApiProvider)) {
        reply.status(400);
        return {
          success: false,
          error: `Invalid provider '${provider}'. Valid providers: ${validProviders.join(', ')}`
        };
      }
      
      // 验证配置
      if (!configuration.apiModelId) {
        reply.status(400);
        return {
          success: false,
          error: 'apiModelId is required'
        };
      }
      
      // 设置提供商
      configuration.provider = provider as ApiProvider;
      
      configManager.setApiConfiguration(provider, configuration);
      
      logger.info('API configuration updated', { provider });
      
      return {
        success: true,
        message: `API configuration for '${provider}' updated successfully`
      };
    } catch (error) {
      logger.error('Failed to update API configuration', { 
        provider: request.params.provider,
        error: error instanceof Error ? error.message : error 
      });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to update API configuration'
      };
    }
  });

  /**
   * DELETE /config/providers/:provider
   * 删除指定提供商配置
   */
  fastify.delete<{ Params: { provider: string } }>('/config/providers/:provider', async (request, reply) => {
    try {
      const { provider } = request.params;
      
      // 检查配置是否存在
      const existingConfig = configManager.getApiConfiguration(provider);
      if (!existingConfig) {
        reply.status(404);
        return {
          success: false,
          error: `API configuration for provider '${provider}' not found`
        };
      }
      
      configManager.removeApiConfiguration(provider);
      
      logger.info('API configuration removed', { provider });
      
      return {
        success: true,
        message: `API configuration for '${provider}' removed successfully`
      };
    } catch (error) {
      logger.error('Failed to remove API configuration', { 
        provider: request.params.provider,
        error: error instanceof Error ? error.message : error 
      });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to remove API configuration'
      };
    }
  });

  /**
   * PUT /config/default-provider
   * 设置默认API提供商
   */
  fastify.put<{ Body: { provider: string } }>('/config/default-provider', async (request, reply) => {
    try {
      const { provider } = request.body;
      
      if (!provider) {
        reply.status(400);
        return {
          success: false,
          error: 'Provider is required'
        };
      }
      
      const providerConfig = configManager.getApiConfiguration(provider);
      
      if (!providerConfig) {
        reply.status(404);
        return {
          success: false,
          error: `API configuration for provider '${provider}' not found`
        };
      }
      
      // 更新默认配置
      configManager.updateConfig({
        defaultApiConfiguration: providerConfig
      });
      
      logger.info('Default API provider updated', { provider });
      
      return {
        success: true,
        message: `Default API provider set to '${provider}'`
      };
    } catch (error) {
      logger.error('Failed to set default API provider', { 
        error: error instanceof Error ? error.message : error 
      });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to set default API provider'
      };
    }
  });
}