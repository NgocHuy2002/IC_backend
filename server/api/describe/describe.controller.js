const Describe = require("./describe.model");
const FileController = require("../file/file.controller");
const File = require("../file/file.model");
const path = require("path");
const fs = require("fs");
var sizeOf = require("image-size");

async function getAllDescribes(req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Convert page and limit to numbers
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Calculate the number of documents to skip
    const skip = (pageNumber - 1) * limitNumber;

    // Retrieve documents with pagination
    const describes = await Describe.find().skip(skip).limit(limitNumber);

    // Check if any documents were found
    if (describes.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });
    }

    res.status(200).json({ describes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function getAllDescribesByFolder(req, res) {
  try {
    const { folder, page = 1, limit = 10 } = req.query;

    // Convert page and limit to numbers
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Calculate the number of documents to skip
    const skip = (pageNumber - 1) * limitNumber;

    // Retrieve documents with pagination
    const describes = await Describe.find({ folder })
      .skip(skip)
      .limit(limitNumber);

    // Check if any documents were found
    if (describes.length === 0) {
      // If page 2 is null, return data from page 1
      if (pageNumber > 1) {
        const firstPageDocuments = await Describe.find({ folder }).limit(
          limitNumber
        );
        const names = firstPageDocuments.map((describe) => describe.name);
        return res.status(200).json({ describes_name: names });
      } else {
        return res.status(404).json({ message: "Không tìm thấy dữ liệu" });
      }
    }

    const names = describes.map((describe) => describe.name);
    res.status(200).json({ describes_name: names });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createDescribe(req, res) {
  try {
    const { name, folder, describe } = req.body;
    let existingDescribe = await Describe.findOne({ name });

    // If a document with the name exists, update its describe field
    if (existingDescribe) {
      return updateDescribe(req, res);
    }
    const describeArray = JSON.parse(describe);
    const newDescribe = new Describe({
      name,
      folder,
      describe: describeArray,
    });
    await newDescribe.save();
    const file = await File.findOne({ folder, name });
    file.haveCaption = true;
    await file.save();
    // await FileController.updateFileInfo({ query: { folder, name } }, res);
    res.status(200).json({ message: "Lưu mô tả thành công" });
  } catch (error) {
    res.status(500).json({ error: error });
  }
}

async function getDescribeByName(req, res) {
  try {
    if (!req.query.name) {
      res.status(400).message("Cần tên dữ liệu");
    }
    // console.log(req.query.name);
    let describe = await Describe.findOne({ name: req.query.name });
    // console.log(describe);
    if (!describe) {
      res.status(404).message("Không tìm thấy dữ liệu");
    }
    res.status(201).json({ describe: describe });
  } catch (error) {
    res.status(500).json({ error: error });
  }
}

async function updateDescribe(req, res) {
  try {
    const { name, folder, describe } = req.body;
    const describeArray = JSON.parse(describe);

    // Find the document by name
    let existingDescribe = await Describe.findOne({ name });

    // If the document does not exist, return a 404 Not Found response
    if (!existingDescribe) {
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });
    }

    // Update the describe field with the new value
    existingDescribe.describe = describeArray;
    existingDescribe.folder = folder;

    // Save the updated document
    await existingDescribe.save();

    // Return a success response
    res.status(200).json({ message: "Cập nhật mô tả thành công" });
  } catch (error) {
    // Handle any errors and return a 500 Internal Server Error response
    res.status(500).json({ error: error.message });
  }
}

async function getAllDataByFolder(req, res) {
  try {
    const { folderName } = req.body;
    // Assuming you're using Mongoose to interact with MongoDB
    const describeData = await Describe.find({ folder: folderName });

    // Construct JSON object
    const data = {
      info: {},
      images: [],
      annotations: [],
    };

    // Iterate over each item in describeData
    for (const item of describeData) {
      const { name, describe } = item;

      // Assuming your images folder is in the same directory as this script
      const imagePath = path.join("uploads", folderName, name);

      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image ${name} not found in folder ${folderName}`);
      }

      // Get image information (width and height)
      const dimensions = await new Promise((resolve, reject) => {
        sizeOf(imagePath, (err, dimensions) => {
          if (err) reject(err);
          else resolve(dimensions);
        });
      });
      const id = generateImageId(name);
      data.images.push({
        id,
        width: dimensions.width,
        height: dimensions.height,
        file_name: name,
        coco_url: name, // Assuming coco_url is the same as file_name
      });

      describe.forEach((caption, index) => {
        data.annotations.push({
          id: data.annotations.length + 1,
          image_id: id, // ID of the last added image
          caption: caption.caption,
          segment_caption: caption.segment_caption,
        });
      });
    }

    // Check if the 'output' folder exists, if not, create it
    const outputFolderPath = path.join("uploads", "output");
    if (!fs.existsSync("output")) {
      fs.mkdirSync("output");
    }

    // Write JSON object to file in the 'output' folder
    const jsonFilePath = path.join("output", `${folderName}.json`);
    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2));

    // Send JSON response
    res.status(200).json({
      success: true,
      message: "JSON file saved successfully",
      file: jsonFilePath,
    });
  } catch (error) {
    // Send error response
    res.status(500).json({ success: false, error: error.message });
  }
}

function generateImageId(imageName) {
  let hash = 0;
  for (let i = 0; i < imageName.length; i++) {
    hash = (hash << 5) - hash + imageName.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash); // Ensure non-negative ID
}

module.exports = {
  createDescribe,
  getDescribeByName,
  getAllDescribes,
  getAllDataByFolder,
  getAllDescribesByFolder,
};
