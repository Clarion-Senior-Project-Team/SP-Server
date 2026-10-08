import { PERMISSIONS } from "./permissions.js";

const RANK = { own: 0, team: 1, all: 2};

const grantedScope = (role, action) => 
    (PERMISSIONS[role] ?? [])
        .map(p => p.split(":"))
        .filter(([res, act]) => `${res}:${act}` === action)
        .map(([, , scope]) => scope)
        .sort((a, b) => RANK[b] - RANK[a])[0] ?? null;

const inScope = (scope, user, r) => {
    if (scope === "all") return true;
    if (r.ownerId === user.id) return true;
    return scope === "team" && r.ownerEmployerId === user.id;
}

export const authorize = (action, loadResource) => async (req, res, next) => {
    const scope = grantedScope(req.user.userLevel, action);
    if (!scope) return res.status(403).json({ error: "Forbidden." });
    const resource = await loadResource(req);
    if (!resource || !inScope(scope, req.user, resource)) {
        return res.status(404).json({ error: "Not Found." });
    }
    req.resource = resource;
    next();
}
