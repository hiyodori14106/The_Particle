let a = 0;
let e = 0;
setInterval(() => {
 e++;
 a = e+a;
 document.getElementById("text").textContent = a; 
},10);
