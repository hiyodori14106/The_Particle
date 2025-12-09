let e = 1;
fiction a () {
  document.getElementById("result").textContent = e;
  e++;
  
}
setInterval(a, 1000); 
