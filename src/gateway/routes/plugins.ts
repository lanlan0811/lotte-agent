import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

export async function registerPluginRoutes(fastify: FastifyInstance, deps: GatewayDeps): Promise<void> {
  const { pluginRegistry, pluginLoader } = deps;

  fastify.get("/api/plugins", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const plugins = pluginRegistry.getAllPlugins();
    return reply.send({
      ok: true,
      data: plugins.map((entry) => ({
        name: entry.name,
        version: entry.manifest.version,
        description: entry.manifest.description,
        author: entry.manifest.author,
        status: entry.status,
        error: entry.error,
        loadedAt: entry.loadedAt,
        tools: entry.manifest.tools ?? [],
        hooks: entry.manifest.hooks ?? [],
        routes: entry.manifest.routes ?? [],
      })),
    });
  });

  fastify.get("/api/plugins/:name", async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const { name } = request.params;
    const entry = pluginRegistry.getPlugin(name);

    if (!entry) {
      return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Plugin '${name}' not found` } });
    }

    return reply.send({
      ok: true,
      data: {
        name: entry.name,
        version: entry.manifest.version,
        description: entry.manifest.description,
        author: entry.manifest.author,
        status: entry.status,
        error: entry.error,
        loadedAt: entry.loadedAt,
        dependencies: entry.manifest.dependencies,
        tools: entry.manifest.tools ?? [],
        hooks: entry.manifest.hooks ?? [],
        routes: entry.manifest.routes ?? [],
      },
    });
  });

  fastify.post("/api/plugins/:name/activate", async (request: FastifyRequest<{ Params: { name: string }; Body: { config?: Record<string, unknown> } }>, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const { name } = request.params;
    const entry = pluginRegistry.getPlugin(name);

    if (!entry) {
      return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Plugin '${name}' not found` } });
    }

    if (entry.status === "active") {
      return reply.send({ ok: true, data: { name, status: "active", message: "Already active" } });
    }

    try {
      const config = request.body?.config ?? {};
      await pluginRegistry.activate(name, config);
      return reply.send({ ok: true, data: { name, status: "active" } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "ACTIVATION_FAILED", message: msg } });
    }
  });

  fastify.post("/api/plugins/:name/deactivate", async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const { name } = request.params;
    const entry = pluginRegistry.getPlugin(name);

    if (!entry) {
      return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Plugin '${name}' not found` } });
    }

    try {
      await pluginRegistry.deactivate(name);
      return reply.send({ ok: true, data: { name, status: "disabled" } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "DEACTIVATION_FAILED", message: msg } });
    }
  });

  fastify.get("/api/plugins/discover", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!pluginLoader) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin loader not initialized" } });
    }

    try {
      const manifests = pluginLoader.discoverPlugins();
      return reply.send({
        ok: true,
        data: manifests.map((m) => ({
          name: m.name,
          version: m.version,
          description: m.description,
          author: m.author,
          main: m.main,
          dependencies: m.dependencies,
        })),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "DISCOVER_FAILED", message: msg } });
    }
  });

  fastify.post("/api/plugins/install", async (request: FastifyRequest<{ Body: { name: string } }>, reply: FastifyReply) => {
    if (!pluginLoader || !pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const { name } = request.body ?? {};
    if (!name) {
      return reply.code(400).send({ ok: false, error: { code: "VALIDATION_ERROR", message: "Plugin name is required" } });
    }

    const existing = pluginRegistry.getPlugin(name);
    if (existing) {
      return reply.code(409).send({ ok: false, error: { code: "CONFLICT", message: `Plugin '${name}' is already registered` } });
    }

    try {
      const manifests = pluginLoader.discoverPlugins();
      const manifest = manifests.find((m) => m.name === name);
      if (!manifest) {
        return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Plugin '${name}' not found in plugins directory` } });
      }

      const plugin = await pluginLoader.loadPlugin(manifest);
      pluginRegistry.register(name, plugin);
      await pluginRegistry.activate(name);

      return reply.send({ ok: true, data: { name, status: "active" } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "INSTALL_FAILED", message: msg } });
    }
  });

  fastify.delete("/api/plugins/:name", async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const { name } = request.params;
    const entry = pluginRegistry.getPlugin(name);

    if (!entry) {
      return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Plugin '${name}' not found` } });
    }

    try {
      if (entry.status === "active") {
        await pluginRegistry.deactivate(name);
      }
      return reply.send({ ok: true, data: { name, status: "removed" } });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return reply.code(500).send({ ok: false, error: { code: "REMOVE_FAILED", message: msg } });
    }
  });

  fastify.get("/api/plugins/:name/tools", async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const { name } = request.params;
    const entry = pluginRegistry.getPlugin(name);

    if (!entry) {
      return reply.code(404).send({ ok: false, error: { code: "NOT_FOUND", message: `Plugin '${name}' not found` } });
    }

    const allTools = pluginRegistry.getTools();
    const pluginTools = [...allTools.entries()]
      .filter(([key]) => key.startsWith(`${name}:`))
      .map(([key, tool]) => ({
        key,
        name: tool.name,
        description: tool.description,
      }));

    return reply.send({ ok: true, data: pluginTools });
  });

  fastify.get("/api/plugins/active", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!pluginRegistry) {
      return reply.code(503).send({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Plugin system not initialized" } });
    }

    const activePlugins = pluginRegistry.getActivePlugins();
    return reply.send({
      ok: true,
      data: activePlugins.map((entry) => ({
        name: entry.name,
        version: entry.manifest.version,
        description: entry.manifest.description,
        loadedAt: entry.loadedAt,
      })),
    });
  });
}
