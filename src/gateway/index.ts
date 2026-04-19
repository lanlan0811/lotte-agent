export { Gateway, type GatewayDeps, type GatewayContext } from "./server.js";
export { WebSocketManager, type RequestFrame, type ResponseFrame, type EventFrame, type GatewayFrame } from "./websocket.js";
export { EventEmitter, type EventHandler } from "./events.js";
export { authenticateRequest, registerAuthMiddleware, type AuthResult, type AuthConfig } from "./auth.js";
