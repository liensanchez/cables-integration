FROM node:22

# Install git
RUN apt-get update && apt-get install -y git

# Create app directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./

RUN npm install

# Copy rest of the app
COPY . .

# Expose the port your app uses
EXPOSE 3000

# Default command
CMD ["npm", "run", "dev"]
