FROM gradle:8.14-jdk21 AS build
WORKDIR /project
COPY . .
RUN gradle --no-daemon bootJar
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /project/build/libs/*.jar app.jar
USER 10001
ENTRYPOINT ["java","-jar","app.jar"]
