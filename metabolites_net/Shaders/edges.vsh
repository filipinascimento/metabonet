uniform mat4 projectionViewMatrix;

attribute vec4 vertex;
attribute vec3 color;

varying vec3 vColor;

void main(void){
	vColor = color;
	
	gl_Position = vertex;
}
