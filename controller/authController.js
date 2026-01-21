const User = require('../models/userSchema');
const generateToken = require('../utils/generateToken');
const { OAuth2Client } = require('google-auth-library');

// Initialize the Google Client
// Make sure GOOGLE_CLIENT_ID is in your .env file
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Unified authentication: handles both signup and login
exports.authenticate = async (req, res) => {
    const { token } = req.body;
    
    try {
        // 1. Verify the Google Token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        
        // 2. Extract user info from the payload
        const { sub, email, name, picture } = ticket.getPayload();

        // 3. Check if user exists
        let user = await User.findOne({ email });

        // 4. If user doesn't exist, create a new one
        if (!user) {
            user = await User.create({
                googleId: sub,
                name,
                email,
                avatar: picture,
                totalBalance: 0,
                groups: [],
            });
        }

        // 5. Generate your app's session token
        const appToken = generateToken(user._id);

        res.status(200).json({
            success: true,
            token: appToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                totalBalance: user.totalBalance,
            }
        });

    } catch (error) {
        console.error("Authentication Error:", error);
        res.status(500).json({ success: false, message: 'Server Error during authentication' });
    }
};