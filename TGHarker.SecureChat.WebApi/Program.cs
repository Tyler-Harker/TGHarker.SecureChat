using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using TGHarker.SecureChat.WebApi.Filters;
using TGHarker.SecureChat.WebApi.Middleware;

var builder = WebApplication.CreateBuilder(args);

// Add controllers
builder.Services.AddControllers();

// Configure CORS for frontend
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:3000"];

        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Add OpenAPI
builder.Services.AddOpenApi();

// Configure JWT authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Authentication:Authority"] ?? "https://identity.harker.dev/tenant/harker";
        options.Audience = builder.Configuration["Authentication:Audience"] ?? "securechat-webapi";

        // Disable automatic claim mapping so 'sub' stays as 'sub'
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.Zero,
            NameClaimType = ClaimTypes.NameIdentifier,
            RoleClaimType = ClaimTypes.Role,
            ValidIssuers = new[]
            {
                builder.Configuration["Authentication:Authority"] ?? "https://identity.harker.dev/tenant/harker"
            },
            ValidAudiences = new[]
            {
                builder.Configuration["Authentication:Audience"] ?? "securechat-webapi",
                "securechat-web"
            }
        };

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>();
                logger.LogError(context.Exception, "JWT authentication failed");
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                var logger = context.HttpContext.RequestServices.GetRequiredService<ILogger<Program>>();
                var userId = context.Principal?.FindFirst("sub")?.Value;
                logger.LogDebug("JWT token validated for user {UserId}", userId);
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// Configure Orleans client with user context filter
builder.UseOrleansClient(clientBuilder =>
{
    clientBuilder
        .UseAzureStorageClustering(options =>
        {
            options.TableServiceClient = new Azure.Data.Tables.TableServiceClient(
                builder.Configuration.GetConnectionString("tableStorage"));
        })
        .AddOutgoingGrainCallFilter<UserContextFilter>();
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Enable CORS (must be before authentication)
app.UseCors();

app.UseHttpsRedirection();

// Authentication & Authorization middleware
app.UseAuthentication();
app.UseAuthorization();

// User context middleware (must come after authentication)
app.UseMiddleware<UserContextMiddleware>();

// Map controllers
app.MapControllers();

app.Run();
