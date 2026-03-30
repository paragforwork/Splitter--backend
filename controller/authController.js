const User = require('../models/userSchema');
const generateToken = require('../utils/generateToken');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

// Initialize the Google Client
const client = new OAuth2Client();

const readAndroidClientIds = () => {
    try {
        const filePath = path.resolve(__dirname, '../../app/android/app/google-services.json');
        if (!fs.existsSync(filePath)) return [];
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const clients = Array.isArray(json?.client) ? json.client : [];
        const ids = clients.flatMap((c) => (Array.isArray(c?.oauth_client) ? c.oauth_client : []))
            .map((c) => c?.client_id)
            .filter(Boolean);
        return [...new Set(ids)];
    } catch {
        return [];
    }
};

const getAllowedClientIds = () => {
    const csvIds = String(process.env.GOOGLE_CLIENT_IDS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    const envSingle = process.env.GOOGLE_CLIENT_ID ? [process.env.GOOGLE_CLIENT_ID.trim()] : [];
    const androidFileIds = readAndroidClientIds();
    return [...new Set([...csvIds, ...envSingle, ...androidFileIds])];
};

// Unified authentication: handles both signup and login
exports.authenticate = async (req, res) => {
    const { token } = req.body;
    
    try {
        if (!token) {
            return res.status(400).json({ success: false, message: 'Google token is required' });
        }

        const allowedClientIds = getAllowedClientIds();
        if (allowedClientIds.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'Google auth is not configured. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_IDS.'
            });
        }

        // 1. Verify the Google Token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: allowedClientIds,
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
        const message = String(error?.message || '');
        console.error("Authentication Error:", message);
        if (message.toLowerCase().includes('wrong recipient')) {
            return res.status(401).json({
                success: false,
                message: 'Google token audience mismatch. Add correct OAuth client IDs in backend config.'
            });
        }
        if (message.toLowerCase().includes('token used too late') || message.toLowerCase().includes('token expired')) {
            return res.status(401).json({ success: false, message: 'Google token expired. Try again.' });
        }
        res.status(500).json({ success: false, message: 'Server Error during authentication' });
    }
};
