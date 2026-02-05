# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files for restore
COPY TGHarker.SecureChat.Contracts/TGHarker.SecureChat.Contracts.csproj TGHarker.SecureChat.Contracts/
COPY TGHarker.SecureChat.ServiceDefaults/TGHarker.SecureChat.ServiceDefaults.csproj TGHarker.SecureChat.ServiceDefaults/
COPY TGHarker.SecureChat.Silo/TGHarker.SecureChat.Silo.csproj TGHarker.SecureChat.Silo/

# Restore dependencies
WORKDIR /src/TGHarker.SecureChat.Silo
RUN dotnet restore

# Copy source files
WORKDIR /src
COPY TGHarker.SecureChat.Contracts/ TGHarker.SecureChat.Contracts/
COPY TGHarker.SecureChat.ServiceDefaults/ TGHarker.SecureChat.ServiceDefaults/
COPY TGHarker.SecureChat.Silo/ TGHarker.SecureChat.Silo/

# Build and publish
WORKDIR /src/TGHarker.SecureChat.Silo
RUN dotnet publish -c Release -o /app/publish --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser

COPY --from=build /app/publish .

# Switch to non-root user
USER appuser

EXPOSE 8080
EXPOSE 11111
EXPOSE 30000

ENV ASPNETCORE_URLS=http://+:8080
ENV DOTNET_RUNNING_IN_CONTAINER=true

ENTRYPOINT ["dotnet", "TGHarker.SecureChat.Silo.dll"]
