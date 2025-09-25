FROM eclipse-temurin:17-jre-focal

ENV EULA=TRUE
ENV MEMORY=5G
ENV VERSION=1.21.8
ENV BUILD=60

RUN apt-get update && apt-get install -y wget

RUN wget "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/${BUILD}/downloads/paper-${VERSION}-${BUILD}.jar" -O paper.jar

RUN echo "eula=true" > eula.txt

EXPOSE 25565

CMD ["java", "-Xmx${MEMORY}", "-Xms${MEMORY}", "-jar", "paper.jar", "nogui"]
