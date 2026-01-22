const jwt=require('jsonwebtoken');
const User =require('../models/userSchema');

const authMiddleware=async(req,res,next)=>{
    let token;
   if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
    try {
        token=req.headers.authorization.split(' ')[1];
        const decoded=jwt.verify(token,process.env.JWT_SECRET);
        req.user=await User.findById(decoded.id).select('-password');
        
        if(!req.user){
            return res.status(401).json({
                success: false,
                message:'User not found. Please login again.'
            });
        }
        
        next();
    } catch (error) {
        console.error('Auth error:', error.message);
        
        if(error.name === 'TokenExpiredError'){
            return res.status(401).json({
                success: false,
                message:'Your session has expired. Please login again.',
                expired: true
            });
        }
        
        if(error.name === 'JsonWebTokenError'){
            return res.status(401).json({
                success: false,
                message:'Invalid token. Please login again.',
                invalid: true
            });
        }
        
        return res.status(401).json({
            success: false,
            message:'Authentication failed. Please login again.'
        });
    }
   } else {
    return res.status(401).json({
        success: false,
        message:'No authentication token provided.'
    });
   }

}
module.exports=authMiddleware;