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

# Establecer el directorio de trabajo en /app
WORKDIR /app

# Copiar los archivos desde la etapa de construcción (builder) al directorio de trabajo
COPY --chown=node:node --from=builder /app .

# Crear el directorio de logs y dar permisos
RUN mkdir logs && chown -R node:node logs

# Cambiar al usuario no privilegiado (node) por razones de seguridad
USER node

# Exponer el puerto 80 para la aplicación
EXPOSE 80

# Establecer el punto de entrada para iniciar la aplicación
ENTRYPOINT ["npm", "start"]
