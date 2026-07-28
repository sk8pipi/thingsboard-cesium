FROM maven:3.9.11-eclipse-temurin-21 AS builder

WORKDIR /build
COPY source/wvp-GB28181-pro/pom.xml ./pom.xml
RUN mvn -B -DskipTests dependency:go-offline

COPY source/wvp-GB28181-pro/ ./
RUN mvn -B -DskipTests clean package

FROM eclipse-temurin:21-jre

WORKDIR /opt/wvp
COPY --from=builder /build/target/wvp-pro-*.jar /opt/wvp/wvp.jar

EXPOSE 18978/tcp
EXPOSE 8160/tcp
EXPOSE 8160/udp

ENTRYPOINT ["java", "-Xms256m", "-Xmx1024m", "-XX:+HeapDumpOnOutOfMemoryError", "-jar", "/opt/wvp/wvp.jar"]

