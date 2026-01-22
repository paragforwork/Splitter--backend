const jwt=require('jsonwebtoken');

const generateToken=(id)=>{
    return jwt.sign({id},process.env.JWT_SECRET,{
        expiresIn:'7d', // 7 days for better UX
    });
}

module.exports=generateToken;