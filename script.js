let a = 0;
let e = 0;
setInterval(() => {
 e = e+0.01
 a = e+a;
 document.getElementById("text").textContent = Mathfloor(a); 
},10)
