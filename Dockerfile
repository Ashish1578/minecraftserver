FROM openjdk:17-jre-slim

# Set environment variables
ENV EULA=TRUE
ENV MEMORY=5G
ENV VERSION=1.20.1

# Expose Minecraft default port
EXPOSE 25565

# Create server directory
RUN mkdir /minecraft
WORKDIR /minecraft

# Download PaperMC server jar
RUN apt-get update && apt-get install -y wget
RUN wget https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/latest/downloads/paper-${VERSION}-latest.jar -O paper.jar

# Accept EULA
RUN echo "eula=true" > eula.txt

# Set server properties (optional tuning for 30 players)
RUN echo "max-players=50" >> server.properties
RUN echo "online-mode=false" >> server.properties

# Run the server with assigned memory
CMD ["java", "-Xmx${MEMORY}", "-Xms${MEMORY}", "-jar", "paper.jar", "nogui"]
