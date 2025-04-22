# Establecer la imagen base para la etapa de construcción (builder)
FROM node:20-alpine AS builder

# Establecer el directorio de trabajo en /app
WORKDIR /app

# Copiar solo los archivos necesarios para instalar dependencias
COPY package.json package-lock.json ./

# Instalar dependencias de producción
RUN npm install --frozen-lockfile 

# Copiar todos los archivos al directorio de trabajo
COPY . .

# Establecer la imagen base para la etapa de producción
FROM node:20-alpine AS production

# Argumentos para personalizar UID/GID (coincidir con host)
ARG UID=1000
ARG GID=1000

# Establecer el directorio de trabajo en /app
WORKDIR /app

# Crear usuario y grupo con UID/GID específicos y asegurar permisos
RUN apk add --no-cache shadow && \
    deluser --remove-home node && \
    addgroup -S -g $GID nodegroup && \
    adduser -S -u $UID -G nodegroup node && \
    mkdir -p /app/logs /app/session_auth_info && \
    chown -R node:nodegroup /app

# Copiar los archivos desde la etapa de construcción (builder) al directorio de trabajo
COPY --chown=node:nodegroup --from=builder /app .

# Cambiar al usuario no privilegiado
USER node

# Exponer el puerto 80 para la aplicación
EXPOSE 80

# Establecer el punto de entrada para iniciar la aplicación
ENTRYPOINT ["npm", "start"]
