function Validator(values){
    let error={}
    const email_pattern = /^[^\s@]+@[^\s@]+\.[^s@]+$/
    const password_pattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

    if (values.name ===''){
        error.name="Name should not empty"
    }
    else{
        error.name=""
    }

    if (values.email ===''){
        error.email="Email should not empty"
    }
    else if(!email_pattern.test(values.email)){
        error.email="email didn't match"
    }
    else{
        error.email=""
    }
    if (values.password===""){
        error.password="Password should not be empty "
    }
    else if(!password_pattern.test(values.password)){
        error.password="Password didn't match"
    }
    else{
        error.password=""
    }
    return error;
    
}


export default Validator;
