export const PERMISSIONS = {
    employee: [
        "timesheet:read:own", "timesheet:edit:own", "timesheet:submit:own",
        "schedule:read:own", "schedule:requestSwap:own",
        "timeoff:read:own", "timeoff:create:own",
    ],
    employer: [
        "timesheet:read:team", "timesheet:approve:team", "timesheet:reject:team",
        "schedule:read:team", "schedule:edit:team", "schedule:publish:team", "schedule:approveSwap:team",
        "timeoff:read:team", "timeoff:approve:team",
    ],
    admin: [
        "timesheet:read:all", "timesheet:edit:all",
        "schedule:read:all", "schedule:override:all",
        "timeoff:read:all", "timeoff:edit:all",
        "users:read:all", "users:create:all", "users:remove:all", "users:assignToEmployer:all", "users:changeRole:all",
        "password:reset:all",
    ],
    developer: ["*"],
};

export const can = (role, perm) => PERMISSIONS[role]?.includes("*") || PERMISSIONS[role]?.includes(perm);

export const requirePermission = (perm) => (req, res, next) => {
    return can(req.user.userLevel, perm) ? next() : res.status(403).json({ error: "Forbidden." });
};

