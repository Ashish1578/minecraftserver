FROM eclipse-temurin:17-jre-focal

ENV EULA=TRUE
ENV MEMORY=5G
ENV VERSION=1.21.8

RUN apt-get update && apt-get install -y wget

# Download PaperMC server jar for version 1.21.8
RUN wget "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/latest/downloads/paper-${VERSION}-latest.jar" -O paper.jar

RUN echo "eula=true" > eula.txt

EXPOSE 25565

CMD ["java", "-Xmx${MEMORY}", "-Xms${MEMORY}", "-jar", "paper.jar", "nogui"]
