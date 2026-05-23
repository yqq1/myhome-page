# 1. 使用 Node 18 镜像，符合项目引擎要求
FROM node:18-alpine

# 2. 设置容器内的工作目录
WORKDIR /app

# 3. 将当前目录下的所有文件复制到容器中
# 包含 index.html, server.js, api/ 文件夹等
COPY . .

# 4. 暴露项目默认的 3000 端口
EXPOSE 3000

# 5. 启动服务
CMD ["npm", "start"]