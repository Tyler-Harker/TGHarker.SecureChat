
using Orleans.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.UseOrleans(siloBuilder =>
{
    siloBuilder.UseAzureStorageClustering(options =>
    {
        options.TableServiceClient = new Azure.Data.Tables.TableServiceClient(builder.Configuration.GetConnectionString("tableStorage"));
    });

    siloBuilder.AddAzureBlobGrainStorageAsDefault(options =>
    {
        options.BlobServiceClient = new Azure.Storage.Blobs.BlobServiceClient(builder.Configuration.GetConnectionString("blobStorage"));
    });
});
var app = builder.Build();

app.Run();
