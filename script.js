let e = 1;

      
        function a() {
            const el = document.getElementById("text");
            if (el) {
                el.textContent = e; 
                e++; 
        }
        setInterval(a, 1000);
