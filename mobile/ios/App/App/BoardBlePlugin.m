#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BoardBlePlugin, "BoardBle",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startScan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopScan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(connect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disconnect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(write, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(cancelWrites, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(configureBoard, CAPPluginReturnPromise);
)
