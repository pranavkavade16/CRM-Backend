const jwt = require("jsonwebtoken");

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided." });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Malformed token. Use format: Authorization: Bearer <token>",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Token is missing after 'Bearer'." });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res
      .status(403)
      .json({ message: "Invalid token", error: error.message }); // ✅ 403, not 402
  }
};

module.exports = verifyJWT;
