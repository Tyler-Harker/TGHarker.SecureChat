using Projects;


var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var searchDb = postgres.AddDatabase("chat-searchdb");


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

var api = builder.AddProject<TGHarker_SecureChat_WebApi>("webapi")
    .WithReference(tableStorage)
    .WithReference(searchDb)
    .WaitFor(silo);



builder.Build().Run();
