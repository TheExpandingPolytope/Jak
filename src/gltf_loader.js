import {mat4, vec4, vec3, quat} from './includes/index.js';
import {draw_data} from './gl_renderer.js';
import {attrib_layout, uniform_names} from './config.js';

const attrib_sizes = {
    "SCALAR":1,
    "VEC2":2,
    "VEC3":3,
    "VEC4":4,
},
array_buffer_promises = {
    /*FILL ME UP BRO*/
};

function load(gl, filepath){
    return download(filepath, "text")
    .then(function(request){
        return JSON.parse(request.responseText);
    })
    .then(function(gltf){
        return process_scene(gl, gltf);
    });
}
function download_no_promise(filepath, response_type) {
    var request = new XMLHttpRequest();
    request.open('GET', filepath, false);  // `false` makes the request synchronous
    if(response_type) request.responseType = response_type;
    request.send(null);

    if (request.status === 200) {
    return request;
    }
}
function download(filepath, response_type)
{
    var xhr = new XMLHttpRequest();  
    return new Promise(function(resolve,reject){
        xhr.onreadystatechange = ()=>{
            if(xhr.readyState !== 4) return false;
            if(xhr.readyState==4 && xhr.status==200){
                resolve(xhr);
            }else{
                reject({
                    status:xhr.status,
                    statusText:xhr.statusText,
                });
            }
        }
        xhr.open('GET',filepath);
        if(response_type) xhr.responseType = response_type;
        xhr.send();
    });
}

function process_scene(gl, gltf, scene_number)
{
    if(scene_number==undefined) scene_number=0;
    var nodes = gltf.scenes[scene_number].nodes;
    if(nodes.length==0) return;
    var renderables = [];
    for(var i=0; i < nodes.length; i++)
        renderables.push(process_node(gl,gltf,i));
    
    console.log(renderables);
    return renderables[0];
}

function process_node(gl, gltf, node_num)
{
    //set node
    var node = gltf.nodes[node_num];
    //set model matrix data
    var m_matrix = mat4.create(),
    has_matrix = node.matrix != undefined,
    has_translate = node.translation !=undefined,
    has_rotation = node.rotation != undefined,
    has_scale = node.scale != undefined;
    if(has_matrix)
        m_matrix = mat4.clone(node.matrix);
    else{
        if(!has_translate) node.translation = vec3.create();
        if(!has_rotation) node.rotation = quat.create();
        if(!has_scale) node.scale = vec3.create();
        mat4.fromRotationTranslationScale(m_matrix,quat.fromValues(...node.rotation),node.translation,node.scale);
    }

    return process_mesh(gl,gltf,node.mesh,m_matrix);

}

function process_mesh(gl,gltf,mesh_num, m_matrix)
{
    //initialize variables
    var mesh = gltf.meshes[mesh_num],
    index_buffer = undefined,
    draw_call_object = {},
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    //vertex attributes
    var count = 0;
    if(mesh.primitives[0].attributes !=undefined){
        for (const key in mesh.primitives[0].attributes) {
            if (mesh.primitives[0].attributes.hasOwnProperty(key)) {
                const attribute = mesh.primitives[0].attributes[key];
                if(key == "POSITION") count = process_accessor(gl, gltf, attribute, key).count;
                else process_accessor(gl, gltf, attribute, key);
            }
        }
    }
    //set draw object and index buffer
    if(mesh.primitives[0].indices ==undefined){
        draw_call_object = {
            "func" : "gl.drawArrays",
            "parameters": [
                gl.TRIANGLES,
                0,
                count,
            ]
        }
    }else{
        //index buffer exists
        var index_accessor = process_accessor(gl, gltf, mesh.primitives[0].indices, null, true);
        index_buffer = index_accessor.buffer;
        draw_call_object = {
            "func" : 'gl.drawElements('+gl.TRIANGLES+','+index_accessor.count+','+index_accessor.type+','+0+')',
            "parameters" : [
                gl.TRIANGLES,
                index_accessor.count,
                index_accessor.type,
                0,
            ]
        }
    }
    gl.bindVertexArray(null);
    return new draw_data(vao, index_buffer, draw_call_object, m_matrix, process_material(gl, gltf, mesh.primitives[0].material));
}

function process_material(gl, gltf, material_num) {
    //set material
    var material = gltf.materials[material_num];

    var textures = [];
    
    if(material.emissiveTexture) textures.push(process_texture(gl, gltf,'emissive_texture', material.emissiveTexture.index));
    if(material.normalTexture) textures.push(process_texture(gl, gltf, 'normal_texture', material.normalTexture.index));
    if(material.occlusionTexture) textures.push(process_texture(gl, gltf, 'occlusion_texture', material.occlusionTexture.index));
    if(material.pbrMetallicRoughness.baseColorTexture) textures.push(process_texture(gl, gltf, 'base_color_texture', material.pbrMetallicRoughness.baseColorTexture.index));
    if(material.pbrMetallicRoughness.metallicRoughnessTexture) textures.push(process_texture(gl, gltf, 'metallic_roughness_texture', material.pbrMetallicRoughness.metallicRoughnessTexture.index));

    return textures;

}

function process_texture(gl, gltf, texture_name, texture_num){
    var image_num = gltf.textures[texture_num].source;
    var image_uri = gltf.images[image_num].uri;
    var image = new Image();
    var buffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, buffer);
    // put a 1x1 red pixel in the texture so it's renderable immediately
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
              gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255,0, 255, 0, 255,0, 0, 255, 255]));
    image.onload = function(){
        gl.bindTexture(gl.TEXTURE_2D, buffer);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
    image.src = image_uri;

    return {
        'buffer_id' : buffer,
        'name' : texture_name,
        'program_location' : null,
    };
}

//processes accessors and buffer data
function process_accessor(gl, gltf, accessor_num,attrib_layout_name, is_indices){ 
    //init
    var accessor = gltf.accessors[accessor_num],
    bufferView = gltf.bufferViews[accessor.bufferView],
    buffer = gltf.buffers[bufferView.buffer],
    buffer_id = gl.createBuffer();

    //set array buffer positions
    var byte_offset = bufferView.byteOffset,
    length = bufferView.byteLength;
    if(accessor.byteOffset) {
        byte_offset += accessor.byteOffset;
        length -= accessor.byteOffset;
    }

    /*check if buffer is already loaded*/
    if(!array_buffer_promises[bufferView.buffer]) {
        //if not loaded, load it to array buffer
        array_buffer_promises[bufferView.buffer] = download(/*'assets/'+*/buffer.uri, "arraybuffer");
    }

    //wait till data is loaded then load to gl buffer
    array_buffer_promises[bufferView.buffer].then(function(data){
        var array_buffer = data.response;
        if(!is_indices){
            var array_data = new Float32Array(array_buffer, byte_offset,length/Float32Array.BYTES_PER_ELEMENT);
            console.log(array_data);
            set_buffer(gl,array_data, buffer_id, attrib_layout_name, accessor.type, accessor.componentType );
        }else{
            var array_data = new Uint16Array(array_buffer, byte_offset, length/Uint16Array.BYTES_PER_ELEMENT);
            console.log(array_data);
            set_indices_buffer(gl, array_data, buffer_id);
        }
    });

    return {
        "buffer":buffer_id,
        "count": accessor.count,
        "type": accessor.componentType,
    }
}

//loads buffer data and sets vertex attrib pointer
function set_buffer(gl, array_data, gl_buffer_id, attrib_layout_name,attrib_type, data_type){
    //set buffer data
    gl.bindBuffer(gl.ARRAY_BUFFER,gl_buffer_id);
    gl.bufferData(gl.ARRAY_BUFFER, array_data, gl.STATIC_DRAW);

    //set vertex attrib pointer
    gl.enableVertexAttribArray(attrib_layout[attrib_layout_name]);
    gl.vertexAttribPointer(attrib_layout[attrib_layout_name], attrib_sizes[attrib_type], data_type, false, 0, 0);
}

//loads element array buffer
function set_indices_buffer(gl, array_data, gl_buffer_id){
    //set buffer data
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl_buffer_id);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, array_data, gl.STATIC_DRAW);
}

function isPowerOf2(value) {
    return (value & (value - 1)) == 0;
}

//loads environmental map and returns a renderable
function env_map(gl){
    const VERTEX_ATTRIB_POSITION = 0;
    var vs_src = `#version 300 es
    layout( location = `+VERTEX_ATTRIB_POSITION+` ) in vec3 position;

    uniform mat4 perspective;
    uniform mat4 view;

    out vec3 v_normal;

    
    void main(){
        gl_Position = perspective*view*vec4(position*vec3(10), 1.0);
        v_normal = (view*vec4(position, 1.0)).xyz;
    }
    `;
    var fs_src = `#version 300 es
    precision mediump float;
 
    in vec3 v_normal;
    out vec4 color;
     
    uniform samplerCube env_map;
     
    void main() {
       color = texture(env_map, normalize(v_normal));
    }
    `;
    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs,vs_src);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.log(gl.getShaderInfoLog(vs));
        gl.deleteShader(vs);
    }
    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs,fs_src);
    gl.compileShader(fs);
    if(!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.log(gl.getShaderInfoLog(fs));
        gl.deleteShader(fs);
    }
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }

    //SET CUBE MAP IMAGE DATA
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const faces = [
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, src: 'assets/env_map/px.jpg' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, src: 'assets/env_map/nx.jpg' },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, src: 'assets/env_map/py.jpg' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, src: 'assets/env_map/ny.jpg' },
        { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, src: 'assets/env_map/pz.jpg' },
        { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, src: 'assets/env_map/nz.jpg' },
    ];
    faces.forEach((face)=>{
        const {target , src} = face;
        var image = new Image();
        image.onload = function(){ 
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
            gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        }
        image.src = src;
    });
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);


    //SET CUBE MAP VERTEX DATA
    const vertex_data = new Float32Array([         
        -1.0,  1.0, -1.0,
        -1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        1.0,  1.0, -1.0,
        -1.0,  1.0, -1.0,

        -1.0, -1.0,  1.0,
        -1.0, -1.0, -1.0,
        -1.0,  1.0, -1.0,
        -1.0,  1.0, -1.0,
        -1.0,  1.0,  1.0,
        -1.0, -1.0,  1.0,

        1.0, -1.0, -1.0,
        1.0, -1.0,  1.0,
        1.0,  1.0,  1.0,
        1.0,  1.0,  1.0,
        1.0,  1.0, -1.0,
        1.0, -1.0, -1.0,

        -1.0, -1.0,  1.0,
        -1.0,  1.0,  1.0,
        1.0,  1.0,  1.0,
        1.0,  1.0,  1.0,
        1.0, -1.0,  1.0,
        -1.0, -1.0,  1.0,

        -1.0,  1.0, -1.0,
        1.0,  1.0, -1.0,
        1.0,  1.0,  1.0,
        1.0,  1.0,  1.0,
        -1.0,  1.0,  1.0,
        -1.0,  1.0, -1.0,

        -1.0, -1.0, -1.0,
        -1.0, -1.0,  1.0,
        1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        -1.0, -1.0,  1.0,
        1.0, -1.0,  1.0
    ]);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertex_data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(VERTEX_ATTRIB_POSITION);
    gl.vertexAttribPointer(VERTEX_ATTRIB_POSITION, 3, gl.FLOAT, gl.FALSE, 0, 0);
    gl.bindVertexArray(null);

    return {
        vao: vao,
        vert_buffer: buffer,
        texture: texture,
        program: program,
        texture_loc: gl.getUniformLocation(program, uniform_names['env_map']),
        perspective_loc: gl.getUniformLocation(program, uniform_names['perspective']),
        view_loc: gl.getUniformLocation(program, uniform_names['view']),
        render: function(gl, camera){
            gl.bindVertexArray(this.vao);
            gl.useProgram(this.program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP,this.texture);
            gl.uniform1i(this.texture_loc, 0);
            camera.set_perspective_uniform(gl, this.perspective_loc);
            camera.set_view_uniform(gl, this.view_loc);
            gl.drawArrays(gl.TRIANGLES, 0, 36);
            gl.bindVertexArray(this.vao);
        },
        set_texture_uniform: function(gl, active_texture_index, texture_uniform_location){
            gl.activeTexture(gl.TEXTURE0+active_texture_index);
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
            gl.uniform1i(texture_uniform_location, 0);
        },
    }
}

export {download, load, env_map};