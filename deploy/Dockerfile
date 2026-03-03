FROM node:18-alpine

# 设置工作目录
WORKDIR /usr/src/app

# 首先只拷贝 package.json 和 package-lock.json 这个层级
# 这些文件不常变，能最大化利用 Docker 构建层缓存
COPY package*.json ./

# 安装生产环境依赖，避免装入开发专用工具(如jest等占体积的包)
RUN npm ci --only=production

# 拷贝项目源代码
COPY . .

# 暴露容器内部的端口 8016
EXPOSE 8016

# 启动 Node 服务
CMD [ "npm", "start" ]
