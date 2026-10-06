FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY services/fraud-detection/pom.xml services/fraud-detection/pom.xml
RUN mvn -f services/fraud-detection/pom.xml dependency:go-offline
COPY services/fraud-detection/src services/fraud-detection/src
RUN mvn -f services/fraud-detection/pom.xml clean package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/services/fraud-detection/target/fraud-detection-1.0.0.jar app.jar
ENV JAVA_TOOL_OPTIONS="-Dserver.port=10000"
EXPOSE 10000
ENTRYPOINT ["java","-jar","app.jar"]
