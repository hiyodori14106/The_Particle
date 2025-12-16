let a = 0;
let e = 0;
setInterval(() => {
 e = e+0.01
 a = Mathfloor(e+a);
 document.getElementById("text").textContent = a; 
},10)
