using Azure.Storage.Blobs;
using Orleans.Hosting;
using TGHarker.SecureChat.Contracts.Services;
using TGHarker.SecureChat.Silo.Filters;
using TGHarker.SecureChat.Silo.Services;
using WebPush;

var builder = WebApplication.CreateBuilder(args);

// Register services
var blobServiceClient = new BlobServiceClient(builder.Configuration.GetConnectionString("blobStorage"));
builder.Services.AddSingleton(blobServiceClient);
builder.Services.AddSingleton<IMessageStorageService, MessageStorageService>();

// Register WebPushClient with VAPID credentials
builder.Services.AddSingleton(_ =>
{
    var vapidSubject = builder.Configuration["Vapid:Subject"] ?? "";
    var vapidPublicKey = builder.Configuration["Vapid:PublicKey"] ?? "";
    var vapidPrivateKey = builder.Configuration["Vapid:PrivateKey"] ?? "";

    var client = new WebPushClient();
    if (!string.IsNullOrEmpty(vapidPublicKey) && !string.IsNullOrEmpty(vapidPrivateKey))
    {
        client.SetVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    }
    return client;
});

// TODO: Configure TGHarker.Orleans.Search
// After setting up source generation in grain state classes, uncomment and configure:
// using YourNamespace.Models.Generated;
// builder.Services.AddOrleansSearch()
//     .UsePostgreSql(builder.Configuration.GetConnectionString("searchdb") ?? "");

// Configure Orleans
builder.UseOrleans(siloBuilder =>
{
    siloBuilder.UseAzureStorageClustering(options =>
    {
        options.TableServiceClient = new Azure.Data.Tables.TableServiceClient(
            builder.Configuration.GetConnectionString("tableStorage"));
    });

    siloBuilder.AddAzureBlobGrainStorageAsDefault(options =>
    {
        options.BlobServiceClient = blobServiceClient;
        options.ContainerName = "securechat-grainstate";
    });

    // Add named blob storage provider
    siloBuilder.AddAzureBlobGrainStorage("AzureBlobStorage", options =>
    {
        options.BlobServiceClient = blobServiceClient;
        options.ContainerName = "securechat-grainstate";
    });

    // TODO: Wrap with searchable storage after Orleans.Search is configured
    // siloBuilder.AddSearchableGrainStorage("AzureBlobStorage");

    // Configure Orleans Reminders for periodic tasks (e.g., message retention cleanup)
    siloBuilder.UseAzureTableReminderService(options =>
    {
        options.TableServiceClient = new Azure.Data.Tables.TableServiceClient(
            builder.Configuration.GetConnectionString("tableStorage"));
    });

    // Configure Orleans Streams for real-time events
    siloBuilder.AddMemoryStreams("ConversationStreamProvider");
    siloBuilder.AddMemoryGrainStorage("PubSubStore");

    // Add incoming grain call filter for user context validation
    siloBuilder.AddIncomingGrainCallFilter<UserContextValidationFilter>();
});

var app = builder.Build();

app.Run();
