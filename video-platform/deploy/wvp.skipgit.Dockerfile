FROM maven:3.9.11-eclipse-temurin-21 AS builder

WORKDIR /build

COPY source/wvp-GB28181-pro/ ./
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests -Dmaven.gitcommitid.skip=true clean package

FROM eclipse-temurin:21-jre

WORKDIR /opt/wvp

COPY --from=builder /build/target/wvp-pro-*.jar /opt/wvp/wvp.jar

EXPOSE 18978/tcp 8160/tcp 8160/udp

ENTRYPOINT ["java", "-XX:+UseG1GC", "-jar", "/opt/wvp/wvp.jar"]
