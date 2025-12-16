let a = 0;
let e = 0;
setInterval(() => {
 e = e+0.01
 a = e+a
 a = Math.floor(e+a);
 document.getElementById("text").textContent = a; 
},10)
