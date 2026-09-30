export const PERMISSIONS = {
    employee: ["timesheet:read:own", "timesheet:edit:own"],
    employer: ["timesheet:read:team", "timesheet:edit:team", "user:create"],
    admin: ["*"],
};

export const can = (role, perm) => PERMISSIONS[role]?.includes("*") || PERMISSIONS[role]?.includes(perm);

export const requirePermission = (perm) => (req, res, next) => {
    return can(req.user.userLevel, perm) ? next() : res.status(403).json({ error: "Forbidden." });
};

