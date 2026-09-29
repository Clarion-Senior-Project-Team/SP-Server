import { loginUser } from "./service";

export const login = async (req, res) => {

    const userName = req?.body?.username;
    const password = req?.body?.password;

    const user = await loginUser(userName, password);

    res.status(200).json({ user });


    // Temp
    const { email, password } = req.body;

    if (!email || !password) {
    return res.status(400).json({ error: "Email and password are both required." });
    }

    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
    return res.status(401).json({ error: "No account found with that email." });
    }

    // bcrypt.compare() hashes the submitted password the same way and
    // checks whether the two hashes match — this is the only correct way
    // to check a password against a hash; there's no "un-hash" step.
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
    return res.status(401).json({ error: "Incorrect password." });
    }

    res.json({ id: user.id, name: user.name, email: user.email });

};

export const signup = async (req, res) => {
    // Sign user up
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are all required." });
      }

      const users = loadUsers();

      // Check for an existing account BEFORE inserting — and this check
      // actually gates the insert below (an `else`, not two separate `if`s).
      // Skipping the `else` is an easy mistake: the duplicate check still
      // prints "already exists," but the insert code runs anyway right
      // after it, since nothing stopped it from executing.
      const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (existing) {
        return res.status(409).json({ error: "An account with that email already exists." });
      } else {
        // Never store the real password — only the hash. bcrypt.hash() is a
        // one-way scramble: there's no function that turns the hash back
        // into "password123". The only way to check a guess later is to
        // hash the guess the same way and compare the two hashes (see login
        // below), never by reversing this one.
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const newUser = {
          id: Date.now().toString(),
          name,
          email,
          password: hashedPassword,
        };
        users.push(newUser);
        saveUsers(users);

        // Send back everything EXCEPT the password (even hashed, no reason
        // for the frontend to ever see it).
        res.status(201).json({ id: newUser.id, name: newUser.name, email: newUser.email });
      }
};

export const logout = async (req, res) => {
    // Log user out
}


