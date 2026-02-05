using Projects;


var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL for Orleans.Search index
var postgres = builder.AddPostgres("postgres");
var searchDb = postgres.AddDatabase("searchdb");

// Azure Storage for Orleans clustering and grain state
var storage = builder.AddAzureStorage("storage");
storage.RunAsEmulator();
var tableStorage = storage.AddTables("tableStorage");
var blobStorage = storage.AddBlobs("blobStorage");

var silo = builder.AddProject<TGHarker_SecureChat_Silo>("silo")
    .WithReference(searchDb)
    .WithReference(tableStorage)
    .WithReference(blobStorage)
    .WaitFor(searchDb)
    .WaitFor(tableStorage)
    .WaitFor(blobStorage);

// Next.js Frontend - define first to get endpoint for CORS
var frontend = builder.AddNpmApp("frontend", "../securechat-client", "dev")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithEnvironment("NEXT_PUBLIC_AUTH_AUTHORITY", "https://identity.harker.dev/tenant/harker")
    .WithExternalHttpEndpoints();

var api = builder.AddProject<TGHarker_SecureChat_WebApi>("webapi")
    .WithReference(tableStorage)
    .WaitFor(silo)
    .WithExternalHttpEndpoints()
    .WithEnvironment("Cors__AllowedOrigins__0", frontend.GetEndpoint("http"));

// Inject API URL into frontend (use HTTPS endpoint)
frontend.WithEnvironment("NEXT_PUBLIC_API_URL", api.GetEndpoint("https"));

builder.Build().Run();
